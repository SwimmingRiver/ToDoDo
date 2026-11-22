import { deriveGoogleCalendarEventId } from "./googleEventId";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface SyncTodoItem {
  id: string;
  title: string;
  /** "YYYY-MM-DD" 로컬 캘린더 날짜 키. ISO 타임스탬프가 아니다 — 클라이언트가
   *  toDateKeyFromISO로 미리 변환해서 보낸 값을 그대로 신뢰한다. Worker는 UTC로만
   *  동작해 사용자의 로컬 타임존을 알 방법이 없으므로, 여기서 직접 ISO를 슬라이싱하면
   *  안 된다(자정 근처 시각에서 하루가 밀리는 버그). action이 "delete"면 빈 문자열이어도
   *  무방하다(사용되지 않음). */
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncResult {
  id: string;
  googleEventId: string | null;
  /** 이 항목 처리가 실패했을 때만 채워진다. 있으면 googleEventId는 호출 전 값을
   *  그대로 반영한 것이라 신뢰할 수 없다 — 호출부는 이 항목을 다음 실행에서 다시
   *  시도해야 한다(스냅샷을 갱신하지 않는 방식으로). */
  error?: string;
}

const toGoogleEventBody = (todo: SyncTodoItem) => {
  const nextDay = new Date(`${todo.dueAt}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    summary: todo.title,
    start: { date: todo.dueAt },
    end: { date: nextDay.toISOString().slice(0, 10) },
    // 삭제된 이벤트는 404가 아니라 tombstone(GET/PATCH 200 + status: cancelled)이다.
    // status 없이 PATCH하면 성공처럼 200이 오면서도 cancelled 그대로 남아 캘린더에
    // 영영 안 보이므로, 모든 upsert에 confirmed를 실어 tombstone을 자동으로 되살린다.
    // 살아있는 이벤트에는 no-op.
    status: "confirmed" as const,
  };
};

export const runWithConcurrencyLimit = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) return;
    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
};

// Workers 런타임은 응답 바디를 읽지 않은 fetch가 일정 개수 이상 동시에 쌓이면
// 데드락 방지를 위해 가장 오래된 요청을 강제로 취소한다 — 이 취소는 아직
// 응답을 안 읽은 "죽은" 요청뿐 아니라 마침 진행 중이던 다른(정상적인) 요청까지
// 덮칠 수 있다. 연동 해제처럼 한 번에 수십 건을 동시에(concurrency 3) 처리할
// 때 이걸 안 지키면, 오래전에 이미 지워진 이벤트들의 처리되지 않은 응답이
// 쌓이면서 방금 만든 진짜 이벤트의 삭제 요청까지 강제로 취소당할 수 있다.
// 그래서 성공/실패/404 모든 분기에서 바디를 반드시 읽거나 취소한다.
const drainBody = async (res: Response): Promise<void> => {
  await res.body?.cancel();
};

// Cloudflare Workers 무료 플랜은 들어온 요청 하나당 서브리퀘스트가 50개까지다(JWKS 조회
// 최대 2회·구글 토큰 갱신 1회 포함). 재시도까지 합친 구글 캘린더 호출이 이 예산을 넘지
// 않게 요청마다 새 예산을 만들어 넘긴다 — 넘으면 런타임이 남은 fetch를 전부 실패시켜,
// 구글엔 반영됐는데 응답을 못 받은 항목이 생길 수 있다.
export const GOOGLE_FETCH_BUDGET = 44;

export interface GoogleFetchBudget {
  used: number;
  limit: number;
}

export const createGoogleFetchBudget = (limit = GOOGLE_FETCH_BUDGET): GoogleFetchBudget => ({ used: 0, limit });

export class GoogleFetchBudgetExhaustedError extends Error {
  constructor() {
    // "budget_exhausted" 접두어는 클라이언트(core recordSyncFailures)와의 계약이다 — 쿨다운 없이
    // 다음 요청에서 바로 다시 보내게 한다. 결과에 이 메시지가 그대로 실리는 건 그 항목이 구글을
    // 한 번도 부르지 못했을 때뿐이다(syncOne이 이미 호출한 항목은 일반 실패로 바꾼다). 바꾸지 말 것.
    super("budget_exhausted: 구글 호출 예산 소진(요청당 서브리퀘스트 한도) — 다음 동기화에서 다시 시도");
    this.name = "GoogleFetchBudgetExhaustedError";
  }
}

export interface GoogleRetryOptions {
  /** 첫 시도 이후 추가 재시도 횟수. Workers는 요청당 서브리퀘스트 수가 제한돼 있어
   *  항목당 최대 (1 + maxRetries)배로만 늘어나도록 작게 둔다. */
  maxRetries?: number;
  baseDelayMs?: number;
  /** 테스트에서 실제로 기다리지 않도록 주입한다. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** 요청 단위 구글 호출 예산. 주면 이 호출(재시도 포함)의 fetch 수를 여기에 센다. */
  budget?: GoogleFetchBudget;
}

const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

const isRateLimitBody = (text: string): boolean => {
  try {
    const parsed = JSON.parse(text) as { error?: { errors?: { reason?: string }[] } };
    const errors = parsed?.error?.errors;
    return Array.isArray(errors) && errors.some((e) => !!e?.reason && RATE_LIMIT_REASONS.has(e.reason));
  } catch {
    return false;
  }
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 11-21 첫 동기화에서 googleEventId가 있는 할 일 ~30건을 동시 10개로 쏘다 구글이
// 403 usageLimits/rateLimitExceeded를 무더기로 돌려줬다. 실패 항목은 클라이언트
// 스냅샷에 안 들어가 todos 재조회마다 즉시 재전송돼 403 폭주(88건)가 됐다. 레이트
// 리밋은 잠깐 기다리면 풀리므로 구글 캘린더 API 호출은 전부 이 헬퍼를 거쳐 429와
// 레이트 리밋 403만 지수 백오프(+지터)로 재시도한다. 권한 등 다른 403은 바디를 이미
// 읽었으므로 같은 상태·본문으로 다시 만든 Response를 돌려줘 기존 에러 처리·메시지를
// 그대로 살린다.
export const fetchGoogleWithRetry = async (
  url: string,
  init: RequestInit,
  opts: GoogleRetryOptions = {},
): Promise<Response> => {
  const { maxRetries = 2, baseDelayMs = 500, sleep = defaultSleep, random = Math.random, budget } = opts;
  const hasBudget = () => !budget || budget.used < budget.limit;
  // 직전 시도의 레이트 리밋 응답(바디는 이미 읽어 다시 만든 것). 재시도 대기 중 다른 워커가
  // 예산을 다 써버리면 이걸 평범한 실패로 돌려준다 — 레이트 리밋에 걸린 항목이므로
  // budget_exhausted(쿨다운 없이 즉시 재전송)가 아니라 일반 실패(쿨다운)여야 한다(리뷰 M-1).
  let lastRateLimited: Response | null = null;
  for (let attempt = 0; ; attempt += 1) {
    if (!hasBudget()) {
      if (lastRateLimited) return lastRateLimited;
      // 이 호출이 구글을 한 번도 못 불렀다 — 호출부(syncOne)가 항목의 앞선 호출 여부로
      // budget_exhausted인지 일반 실패인지 가른다.
      throw new GoogleFetchBudgetExhaustedError();
    }
    // 확인과 증가는 await 없이 붙어 있어 동시 워커끼리도 예산을 넘지 않는다.
    if (budget) budget.used += 1;
    const res = await fetch(url, init);
    let rateLimited = false;
    let bodyText: string | null = null;
    if (res.status === 429) {
      rateLimited = true;
      // 재시도할 때 버리는 응답도 바디를 반드시 소비해야 한다(drainBody 참고) — 나중에 마지막
      // 레이트 리밋 응답으로 돌려줄 수 있게 cancel 대신 text()로 읽어 둔다.
      bodyText = await res.text().catch(() => "");
    } else if (res.status === 403) {
      bodyText = await res.text().catch(() => "");
      rateLimited = isRateLimitBody(bodyText);
    }

    const replay =
      bodyText === null
        ? res
        : new Response(bodyText, { status: res.status, statusText: res.statusText, headers: res.headers });

    // 예산이 바닥났으면 재시도하지 않고 레이트 리밋 응답을 평범한 실패로 돌려준다.
    if (!rateLimited || attempt >= maxRetries || !hasBudget()) return replay;

    lastRateLimited = replay;
    const delay = baseDelayMs * 2 ** attempt + random() * baseDelayMs;
    console.warn(`구글 캘린더 레이트 리밋 (${res.status}), ${Math.round(delay)}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
    await sleep(delay);
  }
};

type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;

// 신규 이벤트 생성을 결정론적 id로 시도한다(id는 todo.id로부터 유도 — deriveGoogleCalendarEventId
// 참고). 여러 탭이 같은 Todo를 동시에 최초 동기화해도 같은 id로 수렴하므로, 나중에 도착한
// 요청은 409 Conflict를 받는다 — 이걸 실패로 취급하지 않고 먼저 생성된 이벤트를 그대로
// 조회해서 반환한다(idempotent upsert). 이 함수는 신규 생성 분기와 "PATCH 대상이 사라져서
// 재생성하는" 분기 양쪽에서 공용으로 쓰인다 — 두 경로 모두 "동시에 같은 이벤트가 없다고
// 판단해 동시에 새로 만들려는" 같은 유형의 레이스에 노출되기 때문이다.
const createGoogleEventIdempotently = async (
  todo: SyncTodoItem,
  accessToken: string,
  googleFetch: GoogleFetch,
): Promise<{ id: string }> => {
  const candidateId = await deriveGoogleCalendarEventId(todo.id);
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const eventBody = toGoogleEventBody(todo);

  const res = await googleFetch(CALENDAR_API_BASE, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ id: candidateId, ...eventBody }),
  });

  if (res.status === 409) {
    // 같은 candidateId의 이벤트가 이미 있다. 두 경우다: (a) 다른 탭이 먼저 생성한 레이스의
    // "패자", (b) 이 Todo의 이벤트가 전에 삭제돼 cancelled tombstone으로 남아 있고 구글이
    // 그 id를 재사용 못 하게 예약해둔 상태. (b)는 드문 게 아니라 일상 경로다 — 보관→복원,
    // 마감일 제거→재설정, 연동 해제→재연결 모두 이벤트를 지웠다가 같은 id로 다시 만든다.
    // 어느 쪽이든 실패로 취급하지 않고 기존 이벤트로 수렴시킨다(idempotent upsert).
    //
    // 이 안에서 일시적 오류(403 rate limit/429/5xx)는 반드시 throw해야 한다. id 미지정
    // POST로 흘려보내면 다른 탭이 이미 X를 만든 상황에서 Y를 하나 더 만들어 이 함수가
    // 막으려는 중복을 그대로 재현한다. throw하면 호출부가 스냅샷을 갱신하지 않아 다음
    // 실행에서 같은 경로(POST X→409→GET X)로 재시도돼 X로 수렴한다.
    await drainBody(res);
    const getRes = await googleFetch(`${CALENDAR_API_BASE}/${candidateId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (getRes.ok) {
      const existing = (await getRes.json()) as { id: string; status?: string };
      if (existing.status !== "cancelled") return existing;

      // tombstone — 같은 id를 status: confirmed로 되살린다(실계정 검증됨). 실패는 throw:
      // 다른 탭이 방금 되살렸을 수 있으므로 재시도하면 GET이 confirmed를 돌려준다.
      console.info(`tombstone 복원 (todo ${todo.id})`);
      const reviveRes = await googleFetch(`${CALENDAR_API_BASE}/${candidateId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ ...eventBody, status: "confirmed" }),
      });
      if (reviveRes.ok) return (await reviveRes.json()) as { id: string };
      const errText = await reviveRes.text().catch(() => "");
      throw new Error(`tombstone 복원 실패 (todo ${todo.id}): ${reviveRes.status} ${errText}`);
    }

    if (getRes.status !== 404 && getRes.status !== 410) {
      const errText = await getRes.text().catch(() => "");
      throw new Error(`이벤트 조회 실패 (충돌 후 조회, todo ${todo.id}): ${getRes.status} ${errText}`);
    }

    // id는 예약돼 있는데(409) 이벤트는 조회조차 안 되는 경우(404/410). 검증된 구글 동작
    // (tombstone은 cancelled로 조회됨)과 어긋나는 상태라 재시도해도 풀리지 않으므로, 이때만
    // 결정론적 id를 포기하고 구글이 새 id를 발급하게 한다. 이 좁은 경우에서만 두 탭이
    // 동시에 여기 도달하면 중복이 남을 수 있다.
    await drainBody(getRes);
    console.warn(`id 예약됐으나 이벤트 조회 불가 (todo ${todo.id}): ${getRes.status} — 자동 id로 생성한다`);
    const fallbackRes = await googleFetch(CALENDAR_API_BASE, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(eventBody),
    });
    if (!fallbackRes.ok) {
      const errText = await fallbackRes.text().catch(() => "");
      throw new Error(`이벤트 생성 실패 (todo ${todo.id}): ${fallbackRes.status} ${errText}`);
    }
    return (await fallbackRes.json()) as { id: string };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`이벤트 생성 실패 (todo ${todo.id}): ${res.status} ${errText}`);
  }
  return (await res.json()) as { id: string };
};

const syncOneOrThrow = async (
  todo: SyncTodoItem,
  accessToken: string,
  googleFetch: GoogleFetch,
): Promise<SyncResult> => {
  if (todo.action === "delete") {
    if (!todo.googleEventId) return { id: todo.id, googleEventId: null };
    const res = await googleFetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const errText = await res.text().catch(() => "");
      throw new Error(`이벤트 삭제 실패 (todo ${todo.id}): ${res.status} ${errText}`);
    }
    await drainBody(res);
    return { id: todo.id, googleEventId: null };
  }

  const hasExistingId = !!todo.googleEventId;

  if (!hasExistingId) {
    const data = await createGoogleEventIdempotently(todo, accessToken, googleFetch);
    return { id: todo.id, googleEventId: data.id };
  }

  const res = await googleFetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEventBody(todo)),
  });

  // PATCH 대상 이벤트가 구글 쪽에서 이미 사라졌다면(사용자가 직접 삭제했거나,
  // 연동 해제 후 재연결해 예전 googleEventId가 가리키던 이벤트가 없어진 경우)
  // 계속 실패로 남기지 않고 새로 생성한다 — 그러지 않으면 이 Todo는 영원히
  // 같은 404로 재시도만 반복하게 된다.
  if (!res.ok && (res.status === 404 || res.status === 410)) {
    await drainBody(res);
    const data = await createGoogleEventIdempotently(todo, accessToken, googleFetch);
    return { id: todo.id, googleEventId: data.id };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`이벤트 PATCH 실패 (todo ${todo.id}): ${res.status} ${errText}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: todo.id, googleEventId: data.id };
};

// syncOneOrThrow가 던지는 에러를 여기서 흡수한다 — 한 항목의 실패가 나머지 항목의
// 결과까지 지워버리면(Promise.all 전체 reject) 이미 구글에 반영된 항목의
// googleEventId를 호출부가 영영 못 받아 다음 실행에서 중복 이벤트를 만든다.
const syncOne = async (todo: SyncTodoItem, accessToken: string, googleFetch: GoogleFetch): Promise<SyncResult> => {
  // 이 항목이 구글을 한 번이라도 불렀는지. googleFetch는 fetch 없이 끝나면 반드시 throw하므로
  // (GoogleFetchBudgetExhaustedError), 값을 돌려받았다면 최소 1회 호출된 것이다.
  let calledGoogle = false;
  const trackedFetch: GoogleFetch = async (url, init) => {
    const res = await googleFetch(url, init);
    calledGoogle = true;
    return res;
  };
  try {
    return await syncOneOrThrow(todo, accessToken, trackedFetch);
  } catch (error) {
    // budget_exhausted는 "구글에 한 번도 시도하지 않은 항목"에만 붙인다(클라이언트가 쿨다운
    // 없이 바로 다시 보낸다). 이미 구글을 부른 뒤(예: POST 409 → GET 직전) 예산이 바닥났으면
    // 일반 실패로 돌려 쿨다운을 건다 — 레이트 리밋 상황에서 즉시 재전송되지 않게(리뷰 M-1).
    if (error instanceof GoogleFetchBudgetExhaustedError && calledGoogle) {
      console.error(`캘린더 이벤트 처리 중 예산 소진 (todo ${todo.id}, action ${todo.action})`);
      return {
        id: todo.id,
        googleEventId: todo.googleEventId,
        error: "구글 호출 예산 소진(처리 도중) — 쿨다운 뒤 다시 시도",
      };
    }
    // 항목별 실패는 결과 배열의 error 필드에만 담겨 호출부(disconnect.ts 등)로
    // 조용히 전달되던 것을 여기서도 로그로 남긴다 — 그러지 않으면 어떤 이벤트가
    // 왜 실패했는지 wrangler tail로도 확인할 방법이 없다.
    console.error(`캘린더 이벤트 처리 실패 (todo ${todo.id}, action ${todo.action}):`, error);
    return {
      id: todo.id,
      googleEventId: todo.googleEventId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

// 기본 동시 요청 수는 3이다 — 10으로 두었을 때 첫 동기화(~30건)만으로도 구글 사용자별
// 레이트 리밋에 걸렸다(11-21). 연동 해제(disconnect.ts)도 이 기본값을 그대로 쓴다.
// 예산(retryOptions.budget)을 안 주면 호출마다 새 예산을 만든다 — 핸들러는 요청마다
// 명시적으로 만들어 넘긴다.
export const syncTodosToGoogleCalendar = async (
  todos: SyncTodoItem[],
  accessToken: string,
  concurrency = 3,
  retryOptions?: GoogleRetryOptions,
): Promise<SyncResult[]> => {
  const options: GoogleRetryOptions = { ...retryOptions, budget: retryOptions?.budget ?? createGoogleFetchBudget() };
  const googleFetch: GoogleFetch = (url, init) => fetchGoogleWithRetry(url, init, options);
  return runWithConcurrencyLimit(todos, concurrency, (todo) => syncOne(todo, accessToken, googleFetch));
};

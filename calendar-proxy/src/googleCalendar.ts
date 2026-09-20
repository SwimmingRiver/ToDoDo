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
// 덮칠 수 있다. 연동 해제처럼 한 번에 수십 건을 동시에(concurrency 10) 처리할
// 때 이걸 안 지키면, 오래전에 이미 지워진 이벤트들의 처리되지 않은 응답이
// 쌓이면서 방금 만든 진짜 이벤트의 삭제 요청까지 강제로 취소당할 수 있다.
// 그래서 성공/실패/404 모든 분기에서 바디를 반드시 읽거나 취소한다.
const drainBody = async (res: Response): Promise<void> => {
  await res.body?.cancel();
};

// 신규 이벤트 생성을 결정론적 id로 시도한다(id는 todo.id로부터 유도 — deriveGoogleCalendarEventId
// 참고). 여러 탭이 같은 Todo를 동시에 최초 동기화해도 같은 id로 수렴하므로, 나중에 도착한
// 요청은 409 Conflict를 받는다 — 이걸 실패로 취급하지 않고 먼저 생성된 이벤트를 그대로
// 조회해서 반환한다(idempotent upsert). 이 함수는 신규 생성 분기와 "PATCH 대상이 사라져서
// 재생성하는" 분기 양쪽에서 공용으로 쓰인다 — 두 경로 모두 "동시에 같은 이벤트가 없다고
// 판단해 동시에 새로 만들려는" 같은 유형의 레이스에 노출되기 때문이다.
const createGoogleEventIdempotently = async (
  todo: SyncTodoItem,
  accessToken: string,
): Promise<{ id: string }> => {
  const candidateId = await deriveGoogleCalendarEventId(todo.id);
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const eventBody = toGoogleEventBody(todo);

  const res = await fetch(CALENDAR_API_BASE, {
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
    const getRes = await fetch(`${CALENDAR_API_BASE}/${candidateId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (getRes.ok) {
      const existing = (await getRes.json()) as { id: string; status?: string };
      if (existing.status !== "cancelled") return existing;

      // tombstone — 같은 id를 status: confirmed로 되살린다(실계정 검증됨). 실패는 throw:
      // 다른 탭이 방금 되살렸을 수 있으므로 재시도하면 GET이 confirmed를 돌려준다.
      console.info(`tombstone 복원 (todo ${todo.id})`);
      const reviveRes = await fetch(`${CALENDAR_API_BASE}/${candidateId}`, {
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
    const fallbackRes = await fetch(CALENDAR_API_BASE, {
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

const syncOneOrThrow = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
  if (todo.action === "delete") {
    if (!todo.googleEventId) return { id: todo.id, googleEventId: null };
    const res = await fetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
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
    const data = await createGoogleEventIdempotently(todo, accessToken);
    return { id: todo.id, googleEventId: data.id };
  }

  const res = await fetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
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
    const data = await createGoogleEventIdempotently(todo, accessToken);
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
const syncOne = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
  try {
    return await syncOneOrThrow(todo, accessToken);
  } catch (error) {
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

export const syncTodosToGoogleCalendar = async (
  todos: SyncTodoItem[],
  accessToken: string,
  concurrency = 10,
): Promise<SyncResult[]> =>
  runWithConcurrencyLimit(todos, concurrency, (todo) => syncOne(todo, accessToken));

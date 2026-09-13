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

  const body = JSON.stringify(toGoogleEventBody(todo));
  const hasExistingId = !!todo.googleEventId;
  const url = hasExistingId ? `${CALENDAR_API_BASE}/${todo.googleEventId}` : CALENDAR_API_BASE;
  const method = hasExistingId ? "PATCH" : "POST";

  let res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  // PATCH 대상 이벤트가 구글 쪽에서 이미 사라졌다면(사용자가 직접 삭제했거나,
  // 연동 해제 후 재연결해 예전 googleEventId가 가리키던 이벤트가 없어진 경우)
  // 계속 실패로 남기지 않고 새로 생성한다 — 그러지 않으면 이 Todo는 영원히
  // 같은 404로 재시도만 반복하게 된다.
  if (hasExistingId && !res.ok && (res.status === 404 || res.status === 410)) {
    await drainBody(res);
    res = await fetch(CALENDAR_API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`이벤트 ${method} 실패 (todo ${todo.id}): ${res.status} ${errText}`);
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

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

const syncOneOrThrow = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
  if (todo.action === "delete") {
    if (!todo.googleEventId) return { id: todo.id, googleEventId: null };
    const res = await fetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`이벤트 삭제 실패 (todo ${todo.id}): ${res.status}`);
    }
    return { id: todo.id, googleEventId: null };
  }

  const body = JSON.stringify(toGoogleEventBody(todo));
  const url = todo.googleEventId ? `${CALENDAR_API_BASE}/${todo.googleEventId}` : CALENDAR_API_BASE;
  const method = todo.googleEventId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`이벤트 ${method} 실패 (todo ${todo.id}): ${res.status}`);
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

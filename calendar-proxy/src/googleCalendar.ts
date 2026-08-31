const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface SyncTodoItem {
  id: string;
  title: string;
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncResult {
  id: string;
  googleEventId: string | null;
}

const toGoogleEventBody = (todo: SyncTodoItem) => {
  const dateKey = todo.dueAt.slice(0, 10);
  const nextDay = new Date(`${dateKey}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    summary: todo.title,
    start: { date: dateKey },
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

const syncOne = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
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

export const syncTodosToGoogleCalendar = async (
  todos: SyncTodoItem[],
  accessToken: string,
  concurrency = 10,
): Promise<SyncResult[]> =>
  runWithConcurrencyLimit(todos, concurrency, (todo) => syncOne(todo, accessToken));

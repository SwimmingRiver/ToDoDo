import { describe, it, expect, vi, afterEach } from "vitest";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

describe("syncTodosToGoogleCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("googleEventId가 없으면 POST로 새 이벤트를 생성한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "테스트", dueAt: "2026-09-01T00:00:00.000Z", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CALENDAR_API_BASE);
    expect(init.method).toBe("POST");
  });

  it("googleEventId가 있으면 PATCH로 기존 이벤트를 수정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "existing-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목 변경",
        dueAt: "2026-09-01T00:00:00.000Z",
        googleEventId: "existing-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "existing-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/existing-event-id`);
    expect(init.method).toBe("PATCH");
  });

  it("action이 delete면 DELETE 요청을 보내고 googleEventId null을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "event-to-delete", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/event-to-delete`);
    expect(init.method).toBe("DELETE");
  });

  it("삭제 대상 이벤트가 구글에 이미 없어도(404) 실패로 취급하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "already-gone", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");
    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
  });

  it("동시 요청 수를 제한한다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true, json: async () => ({ id: "event-id" }) };
      }),
    );

    const todos: SyncTodoItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: `todo-${i}`,
      title: `할 일 ${i}`,
      dueAt: "2026-09-01T00:00:00.000Z",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token", 5);

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });
});

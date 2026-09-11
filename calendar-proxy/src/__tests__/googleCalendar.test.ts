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
      { id: "todo-1", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CALENDAR_API_BASE);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      summary: "테스트",
      start: { date: "2026-09-01" },
      end: { date: "2026-09-02" },
    });
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
        dueAt: "2026-09-01",
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

  it("PATCH 대상 이벤트가 이미 삭제됐으면(404) 새로 생성한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-event-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목",
        dueAt: "2026-09-01",
        googleEventId: "deleted-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstUrl).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/deleted-event-id");
    expect(firstInit.method).toBe("PATCH");
    const [secondUrl, secondInit] = fetchMock.mock.calls[1];
    expect(secondUrl).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(secondInit.method).toBe("POST");
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
      dueAt: "2026-09-01",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token", 5);

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it("일부 항목이 실패해도 나머지 결과는 그대로 반환한다(전체 reject 안 함)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "event-success" }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-ok", title: "성공", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
      { id: "todo-fail", title: "실패", dueAt: "2026-09-02", googleEventId: null, action: "upsert" },
    ];

    // concurrency 1로 고정해 mockResolvedValueOnce 순서와 실행 순서를 일치시킨다.
    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([
      { id: "todo-ok", googleEventId: "event-success" },
      { id: "todo-fail", googleEventId: null, error: expect.stringContaining("500") },
    ]);
  });
});

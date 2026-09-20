import { describe, it, expect, vi, afterEach } from "vitest";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";
import { deriveGoogleCalendarEventId } from "../googleEventId";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

describe("syncTodosToGoogleCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("googleEventId가 없으면 결정론적 id로 POST해서 새 이벤트를 생성한다", async () => {
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
      id: await deriveGoogleCalendarEventId("todo-1"),
      summary: "테스트",
      start: { date: "2026-09-01" },
      end: { date: "2026-09-02" },
    });
  });

  it("같은 todo id로 다시 최초 동기화해도 항상 같은 후보 id로 POST한다(결정론성)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-stable", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    await syncTodosToGoogleCalendar(todos, "access-token");
    await syncTodosToGoogleCalendar(todos, "access-token");

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.id).toBe(secondBody.id);
    expect(firstBody.id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("다른 탭이 같은 후보 id로 먼저 생성해 409가 나면, 기존 이벤트를 조회해 성공으로 처리한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "won-by-other-tab", status: "confirmed" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-race", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-race", googleEventId: "won-by-other-tab" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, postInit] = fetchMock.mock.calls[0];
    expect(postInit.method).toBe("POST");
    const candidateId = JSON.parse(postInit.body).id;
    const [getUrl, getInit] = fetchMock.mock.calls[1];
    expect(getUrl).toBe(`${CALENDAR_API_BASE}/${candidateId}`);
    expect(getInit.method).toBeUndefined(); // GET (fetch 기본 메서드)
  });

  it("409 충돌 후 조회한 이벤트가 취소된(tombstone) 상태면 되살리기(PATCH)를 시도한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id", status: "cancelled" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-tombstone", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-tombstone", googleEventId: "candidate-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, reviveInit] = fetchMock.mock.calls[2];
    expect(reviveInit.method).toBe("PATCH");
    expect(JSON.parse(reviveInit.body).status).toBe("confirmed");
  });

  it("tombstone 되살리기가 일시적으로 실패하면 id 미지정 POST로 폴백하지 않고 에러로 남겨 재시도되게 한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id", status: "cancelled" }) })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Too Many Requests" });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-retry", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    // 다른 탭이 방금 되살렸을 수 있으므로 새 랜덤 id 이벤트를 만들면 중복이 된다 —
    // 에러로 남기면 호출부가 스냅샷을 갱신하지 않아 다음 실행에서 같은 id로 수렴한다.
    expect(results).toEqual([
      { id: "todo-retry", googleEventId: null, error: expect.stringContaining("429") },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("409 충돌 후 조회가 일시적 오류(403)면 id 미지정 POST로 폴백하지 않고 에러로 남긴다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "rateLimitExceeded" });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-transient", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([
      { id: "todo-transient", googleEventId: null, error: expect.stringContaining("403") },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("409 충돌 후 조회가 404면(id는 예약됐지만 이벤트 조회 불가) 그때만 id 미지정 POST로 폴백한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Not Found" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "brand-new-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-odd", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-odd", googleEventId: "brand-new-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [fallbackUrl, fallbackInit] = fetchMock.mock.calls[2];
    expect(fallbackUrl).toBe(CALENDAR_API_BASE);
    expect(fallbackInit.method).toBe("POST");
    expect(JSON.parse(fallbackInit.body).id).toBeUndefined();
  });

  it("PATCH 대상 이벤트가 이미 삭제됐으면(404) 결정론적 id로 새로 생성한다", async () => {
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
    expect(JSON.parse(secondInit.body).id).toBe(await deriveGoogleCalendarEventId("todo-1"));
  });

  it("PATCH 404 재생성 경로에서도 다른 탭이 먼저 만들었으면(409) 기존 이벤트로 수렴한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "won-by-other-tab", status: "confirmed" }),
      });
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

    expect(results).toEqual([{ id: "todo-1", googleEventId: "won-by-other-tab" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" });
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

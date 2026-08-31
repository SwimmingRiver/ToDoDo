import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("id-token") } },
  googleProvider: {},
}));

vi.stubEnv("VITE_CALENDAR_PROXY_URL", "https://proxy.example.com");

// Dynamic import to ensure module loads after env is stubbed
const {
  getOAuthStartUrl,
  syncTodosToCalendar,
  getGoogleCalendarEvents,
  disconnectCalendar,
} = await import("../calendarProxyApi");

describe("calendarProxyApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getOAuthStartUrl은 Authorization 헤더를 붙여 /oauth/start를 호출하고 authUrl을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authUrl: "https://accounts.google.com/consent" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const authUrl = await getOAuthStartUrl();

    expect(authUrl).toBe("https://accounts.google.com/consent");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/oauth/start");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("getOAuthStartUrl은 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(getOAuthStartUrl()).rejects.toThrow("OAuth 시작 실패");
  });

  it("syncTodosToCalendar는 Authorization 헤더를 붙여 /sync-todos를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: "todo-1", googleEventId: "event-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos = [
      { id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: null, action: "upsert" as const },
    ];
    const result = await syncTodosToCalendar(todos);

    expect(result).toEqual([{ id: "todo-1", googleEventId: "event-1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/sync-todos");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(syncTodosToCalendar([])).rejects.toThrow("동기화 실패");
  });

  it("getGoogleCalendarEvents는 Authorization 헤더를 붙여 /events를 호출해 이벤트 목록을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await getGoogleCalendarEvents();

    expect(events).toEqual([{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/events");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("getGoogleCalendarEvents는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(getGoogleCalendarEvents()).rejects.toThrow("이벤트 조회 실패");
  });

  it("disconnectCalendar는 Authorization 헤더를 붙이고 googleEventIds를 담아 /disconnect를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await disconnectCalendar(["event-1", "event-2"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/disconnect");
    expect(init.headers.Authorization).toBe("Bearer id-token");
    expect(JSON.parse(init.body)).toEqual({ googleEventIds: ["event-1", "event-2"] });
  });

  it("disconnectCalendar는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(disconnectCalendar([])).rejects.toThrow("연동 해제 실패");
  });
});

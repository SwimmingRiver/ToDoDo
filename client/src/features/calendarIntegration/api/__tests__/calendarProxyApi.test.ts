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
  CalendarRevokedError,
  CalendarNotConnectedError,
} = await import("../calendarProxyApi");

const anyRange = { timeMin: "2026-08-30T15:00:00.000Z", timeMax: "2026-10-10T15:00:00.000Z" };

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

  it("401 응답이 {error: revoked}이면 CalendarRevokedError를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "revoked" }),
      }),
    );
    await expect(syncTodosToCalendar([])).rejects.toThrow(CalendarRevokedError);
  });

  // Worker는 토큰 레코드가 없으면(연동 해제 뒤) 409 {error:"not_connected"}를 준다.
  // 다른 탭에서 해제한 뒤 이 탭의 연동 캐시가 아직 stale하면 동기화가 이 응답을
  // 만나는데, 일반 에러로 뭉개면 Sentry에 오탐이 쌓인다.
  it("syncTodosToCalendar는 409 응답이 {error: not_connected}이면 CalendarNotConnectedError를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "not_connected" }) }),
    );
    await expect(syncTodosToCalendar([])).rejects.toBeInstanceOf(CalendarNotConnectedError);
  });

  it("401 응답이어도 revoked가 아니면 일반 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );
    await expect(syncTodosToCalendar([])).rejects.toThrow("동기화 실패");
  });

  it("getGoogleCalendarEvents는 Authorization 헤더를 붙여 /events를 호출해 이벤트 목록을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await getGoogleCalendarEvents(anyRange);

    expect(events).toEqual([{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/proxy\.example\.com\/events\?/);
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  // /events도 Worker가 리프레시 토큰 철회를 감지하면 401 {error:"revoked"}를
  // 반환한다(events.ts). 여기서 일반 에러로 뭉개면 sync 경로가 돌기 전까지
  // "다시 연결" 상태 전환이 안 일어난다.
  it("getGoogleCalendarEvents는 조회 범위를 timeMin/timeMax 쿼리스트링으로 넘긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getGoogleCalendarEvents({
      timeMin: "2026-08-30T15:00:00.000Z",
      timeMax: "2026-10-10T15:00:00.000Z",
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/events");
    expect(url.searchParams.get("timeMin")).toBe("2026-08-30T15:00:00.000Z");
    expect(url.searchParams.get("timeMax")).toBe("2026-10-10T15:00:00.000Z");
  });

  it("getGoogleCalendarEvents는 401 응답이 {error: revoked}이면 CalendarRevokedError를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "revoked" }),
      }),
    );
    await expect(getGoogleCalendarEvents(anyRange)).rejects.toBeInstanceOf(CalendarRevokedError);
  });

  it("getGoogleCalendarEvents는 401 응답이어도 revoked가 아니면 일반 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const err = await getGoogleCalendarEvents(anyRange).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CalendarRevokedError);
  });

  it("getGoogleCalendarEvents는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(getGoogleCalendarEvents(anyRange)).rejects.toThrow("이벤트 조회 실패");
  });

  it("disconnectCalendar는 Authorization 헤더를 붙이고 googleEventIds를 담아 /disconnect를 호출하며, 실제로 삭제 확인된 id 목록을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, deletedGoogleEventIds: ["event-1"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await disconnectCalendar(["event-1", "event-2"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/disconnect");
    expect(init.headers.Authorization).toBe("Bearer id-token");
    expect(JSON.parse(init.body)).toEqual({ googleEventIds: ["event-1", "event-2"] });
    expect(result).toEqual({ deletedGoogleEventIds: ["event-1"] });
  });

  it("disconnectCalendar는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(disconnectCalendar([])).rejects.toThrow("연동 해제 실패");
  });
});

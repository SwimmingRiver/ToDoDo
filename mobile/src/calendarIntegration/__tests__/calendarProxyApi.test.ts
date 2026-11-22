import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const getIdToken = jest.fn<(force?: boolean) => Promise<string>>();
const mockAuth: { currentUser: { getIdToken: typeof getIdToken } | null } = { currentUser: { getIdToken } };
jest.mock("../../firebase", () => ({ get auth() { return mockAuth; } }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
// 실제 Response처럼 clone()으로 본문을 한 번 더 읽을 수 있게 한다.
const res403 = () => {
  const res = { ok: false, status: 403, json: async () => ({ error: "PREMIUM_REQUIRED" }), clone: () => res } as unknown as Response;
  return res;
};

describe("calendarProxyApi", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL = "https://cal.example.com";
    mockAuth.currentUser = { getIdToken };
    getIdToken.mockReset();
    getIdToken.mockResolvedValue("tok");
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("OAuth 시작 URL은 client=app으로 요청하고 토큰을 싣는다", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(ok({ authUrl: "https://accounts.google.com/x" }));
    global.fetch = fetchMock;
    const { getOAuthStartUrl } = await import("../calendarProxyApi");
    await expect(getOAuthStartUrl()).resolves.toBe("https://accounts.google.com/x");
    expect(fetchMock.mock.calls[0][0]).toBe("https://cal.example.com/oauth/start?client=app");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("403 PREMIUM_REQUIRED면 토큰을 강제 갱신해 한 번 재시도하고 두 번째 결과를 반환한다", async () => {
    getIdToken.mockResolvedValueOnce("old").mockResolvedValueOnce("fresh");
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(res403())
      .mockResolvedValueOnce(ok({ results: [{ id: "t1", googleEventId: "g1" }] }));
    global.fetch = fetchMock;
    const { syncTodosToCalendar } = await import("../calendarProxyApi");
    const payload = [{ id: "t1", title: "a", dueAt: "2026-11-21", googleEventId: null, action: "upsert" as const }];
    await expect(syncTodosToCalendar(payload)).resolves.toEqual([{ id: "t1", googleEventId: "g1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    const second = fetchMock.mock.calls[1][1] as RequestInit;
    expect(second.headers).toMatchObject({ Authorization: "Bearer fresh", "Content-Type": "application/json" });
    expect(second.method).toBe("POST");
    expect(second.body).toBe(JSON.stringify({ todos: payload }));
  });

  it("403이 두 번이면 오류로 거절하고 fetch는 정확히 2번", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(async () => res403());
    global.fetch = fetchMock;
    const { getOAuthStartUrl } = await import("../calendarProxyApi");
    await expect(getOAuthStartUrl()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("URL 환경변수가 없으면 거절하고 fetch하지 않는다", async () => {
    process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL = "";
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    const { getOAuthStartUrl } = await import("../calendarProxyApi");
    await expect(getOAuthStartUrl()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 거절한다", async () => {
    mockAuth.currentUser = null;
    global.fetch = jest.fn<typeof fetch>();
    const { getOAuthStartUrl } = await import("../calendarProxyApi");
    await expect(getOAuthStartUrl()).rejects.toThrow();
  });

  it("이벤트 조회는 timeMin/timeMax 쿼리로 요청한다", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(ok({ events: [] }));
    global.fetch = fetchMock;
    const { getGoogleCalendarEvents } = await import("../calendarProxyApi");
    await getGoogleCalendarEvents({ timeMin: "2026-11-01T00:00:00Z", timeMax: "2026-12-01T00:00:00Z" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://cal.example.com/events?timeMin=2026-11-01T00%3A00%3A00Z&timeMax=2026-12-01T00%3A00%3A00Z",
    );
  });

  it("연동 해제는 googleEventIds를 POST한다", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(ok({ deletedGoogleEventIds: ["g1"] }));
    global.fetch = fetchMock;
    const { disconnectCalendar } = await import("../calendarProxyApi");
    await expect(disconnectCalendar(["g1", "g2"])).resolves.toEqual({ deletedGoogleEventIds: ["g1"] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://cal.example.com/disconnect");
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(JSON.stringify({ googleEventIds: ["g1", "g2"] }));
  });

  // 무료 플랜 Worker는 요청당 서브리퀘스트 50개 — 이벤트가 많으면 한 요청으로 다 못 지운다.
  it("disconnectCalendar는 10개씩 순서대로 keepToken:true로 보내고, 마지막 요청만 토큰을 지우며 결과를 합친다", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const { googleEventIds } = JSON.parse((init as RequestInit).body as string) as { googleEventIds: string[] };
      return ok({ deletedGoogleEventIds: googleEventIds });
    });
    global.fetch = fetchMock;
    const { disconnectCalendar } = await import("../calendarProxyApi");
    const ids = Array.from({ length: 23 }, (_, i) => `g${i}`);

    await expect(disconnectCalendar(ids)).resolves.toEqual({ deletedGoogleEventIds: ids });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies.map((b) => [b.googleEventIds.length, b.keepToken])).toEqual([
      [10, true],
      [10, true],
      [3, undefined],
    ]);
  });

  it("disconnectCalendar는 중간 요청이 실패하면 멈추고 던진다", async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ deletedGoogleEventIds: [] }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    global.fetch = fetchMock;
    const { disconnectCalendar } = await import("../calendarProxyApi");

    await expect(disconnectCalendar(Array.from({ length: 30 }, (_, i) => `g${i}`))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

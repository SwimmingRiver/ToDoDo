import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { authorizedFetchMock } = vi.hoisted(() => ({ authorizedFetchMock: vi.fn() }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: authorizedFetchMock }));

const load = async (url: string) => {
  vi.stubEnv("VITE_REMINDER_PROXY_URL", url);
  vi.resetModules();
  return import("../reminderProxyApi");
};

beforeEach(() => authorizedFetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
afterEach(() => vi.unstubAllEnvs());

describe("reminderProxyApi", () => {
  it("토큰 등록은 POST /push-tokens {token, platform: web}", async () => {
    const api = await load("https://r.example.com");
    await api.registerPushToken("tok");
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/push-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tok", platform: "web" }),
    });
  });

  it("토큰 해제는 DELETE /push-tokens {token}", async () => {
    const api = await load("https://r.example.com");
    await api.unregisterPushToken("tok");
    expect(authorizedFetchMock.mock.calls[0][2]).toMatchObject({
      method: "DELETE",
      body: JSON.stringify({ token: "tok" }),
    });
  });

  it("refresh는 POST /reminders/refresh, 실패 응답이면 throw", async () => {
    const api = await load("https://r.example.com");
    authorizedFetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(api.requestReminderRefresh()).rejects.toThrow("500");
    expect(authorizedFetchMock.mock.calls[0][1]).toBe("/reminders/refresh");
  });

  it("URL이 설정되지 않았으면 아무것도 보내지 않는다(로컬 개발)", async () => {
    const api = await load("");
    await api.requestReminderRefresh();
    await api.registerPushToken("tok");
    expect(authorizedFetchMock).not.toHaveBeenCalled();
  });

  it("기록 조회는 GET /reminders/history, 본문 JSON을 돌려준다", async () => {
    const api = await load("https://r.example.com");
    const body = { items: [], lastSeenAt: 5 };
    authorizedFetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    expect(await api.fetchReminderHistory()).toEqual(body);
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/reminders/history", { method: "GET" });
  });

  it("기록 조회가 실패 응답이면 throw", async () => {
    const api = await load("https://r.example.com");
    authorizedFetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(api.fetchReminderHistory()).rejects.toThrow("500");
  });

  it("읽음 처리는 POST /reminders/history/seen {seenUntil}", async () => {
    const api = await load("https://r.example.com");
    await api.markReminderHistorySeen(123);
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/reminders/history/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seenUntil: 123 }),
    });
  });

  it("URL이 없으면 기록은 네트워크 없이 빈 결과", async () => {
    const api = await load("");
    expect(await api.fetchReminderHistory()).toEqual({ items: [], lastSeenAt: 0 });
    await api.markReminderHistorySeen(1);
    expect(authorizedFetchMock).not.toHaveBeenCalled();
  });
});

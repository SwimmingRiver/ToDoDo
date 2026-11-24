import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("../../firebase", () => ({
  auth: { currentUser: { getIdToken: jest.fn(() => Promise.resolve("idtok")) } },
}));

const okRes = (body: unknown = {}, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

describe("reminderProxyApi", () => {
  const fetchMock = jest.fn<typeof fetch>();
  const original = process.env.EXPO_PUBLIC_REMINDER_PROXY_URL;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = "https://rp.test";
  });
  afterEach(() => {
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = original;
  });

  it("register posts token and platform with bearer", async () => {
    fetchMock.mockResolvedValue(okRes());
    const { registerPushToken } = await import("../api/reminderProxyApi");
    await registerPushToken("t", "ios");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://rp.test/push-tokens");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ token: "t", platform: "ios" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer idtok");
  });

  it("skips silently when url empty", async () => {
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = "";
    const { registerPushToken } = await import("../api/reminderProxyApi");
    await expect(registerPushToken("t", "ios")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on non-ok", async () => {
    fetchMock.mockResolvedValue(okRes({}, 500));
    const { registerPushToken } = await import("../api/reminderProxyApi");
    await expect(registerPushToken("t", "ios")).rejects.toThrow();
  });
});

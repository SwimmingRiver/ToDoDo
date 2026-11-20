import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const getIdToken = jest.fn<() => Promise<string>>();
const mockAuth: { currentUser: { getIdToken: typeof getIdToken } | null } = { currentUser: { getIdToken } };
jest.mock("../../firebase", () => ({ get auth() { return mockAuth; } }));

const input = { goal: "자격증 따기", deadline: "2026-12-31" } as never;

describe("requestPlan", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_AI_PROXY_URL = "https://ai.example.com";
    mockAuth.currentUser = { getIdToken };
    getIdToken.mockResolvedValue("tok");
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("토큰을 실어 /plan에 POST하고 응답을 해석한다", async () => {
    const result = { plan: { parent: {}, children: [] }, usage: { used: 1, limit: 20 } };
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200, json: async () => result } as Response);
    global.fetch = fetchMock;
    const { requestPlan } = await import("../aiProxyApi");
    await requestPlan(input);
    expect(fetchMock).toHaveBeenCalledWith("https://ai.example.com/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify(input),
    });
  });

  it("URL이 비어 있으면 UNKNOWN으로 거절한다", async () => {
    process.env.EXPO_PUBLIC_AI_PROXY_URL = "";
    const { requestPlan } = await import("../aiProxyApi");
    await expect(requestPlan(input)).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("네트워크 예외도 UNKNOWN으로 거절한다", async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new TypeError("Network request failed"));
    const { requestPlan } = await import("../aiProxyApi");
    await expect(requestPlan(input)).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("로그인하지 않았으면 UNKNOWN으로 거절한다", async () => {
    mockAuth.currentUser = null;
    const { requestPlan } = await import("../aiProxyApi");
    await expect(requestPlan(input)).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("403 PREMIUM_REQUIRED는 해당 코드로 거절한다", async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "PREMIUM_REQUIRED" }) } as Response);
    const { requestPlan } = await import("../aiProxyApi");
    await expect(requestPlan(input)).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
  });
});

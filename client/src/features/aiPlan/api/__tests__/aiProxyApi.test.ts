import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VITE_AI_PROXY_URL", "https://ai.example.com");
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "@/shared/lib/authorizedFetch";
const { requestPlan, AiPlanError, isExpectedAiPlanError } = await import("../aiProxyApi");

const input = { goal: "이사 준비", dueDate: null, today: "2026-09-25" };
const jsonRes = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("requestPlan", () => {
  beforeEach(() => vi.mocked(authorizedFetch).mockReset());

  it("POST /plan에 JSON 본문을 보내고 결과를 돌려준다", async () => {
    const result = { plan: { title: "t", dueDate: null, items: [] }, usage: { used: 1, limit: 20 } };
    vi.mocked(authorizedFetch).mockResolvedValueOnce(jsonRes(result, 200));
    await expect(requestPlan(input)).resolves.toEqual(result);
    expect(authorizedFetch).toHaveBeenCalledWith("https://ai.example.com", "/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  });

  it.each([
    [403, "PREMIUM_REQUIRED"],
    [429, "DAILY_LIMIT"],
    [502, "PLAN_INVALID"],
    [400, "INVALID_INPUT"],
    [503, "AI_UNAVAILABLE"],
    [401, "UNAUTHORIZED"],
  ])("%i %s는 같은 code의 AiPlanError", async (status, code) => {
    vi.mocked(authorizedFetch).mockResolvedValueOnce(jsonRes({ error: code }, status));
    const error = await requestPlan(input).catch((e) => e);
    expect(error).toBeInstanceOf(AiPlanError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  });

  it("본문이 JSON이 아니거나 모르는 code면 UNKNOWN", async () => {
    vi.mocked(authorizedFetch).mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));
    const error = await requestPlan(input).catch((e) => e);
    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(500);
  });
});

describe("isExpectedAiPlanError", () => {
  it("권한·한도·AI 결과 불량만 예상된 실패로 본다", () => {
    expect(isExpectedAiPlanError(new AiPlanError("PREMIUM_REQUIRED", 403))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("DAILY_LIMIT", 429))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("PLAN_INVALID", 502))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("AI_UNAVAILABLE", 503))).toBe(false);
    expect(isExpectedAiPlanError(new AiPlanError("INVALID_INPUT", 400))).toBe(false);
    expect(isExpectedAiPlanError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

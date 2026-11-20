import { describe, it, expect } from "vitest";
import { AiPlanError, isExpectedAiPlanError, parsePlanResponse } from "../types";

const jsonRes = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("parsePlanResponse", () => {
  it("ok 응답은 JSON을 그대로 돌려준다", async () => {
    const result = { plan: { title: "t", dueDate: null, items: [] }, usage: { used: 1, limit: 20 } };
    await expect(parsePlanResponse(jsonRes(result, 200))).resolves.toEqual(result);
  });

  it.each([
    [403, "PREMIUM_REQUIRED"],
    [429, "DAILY_LIMIT"],
    [502, "PLAN_INVALID"],
    [400, "INVALID_INPUT"],
    [503, "AI_UNAVAILABLE"],
    [401, "UNAUTHORIZED"],
    [400, "NOT_A_GOAL"],
    [429, "TOO_FREQUENT"],
    [429, "ATTEMPT_LIMIT"],
  ])("%i %s는 같은 code의 AiPlanError", async (status, code) => {
    const error = await parsePlanResponse(jsonRes({ error: code }, status)).catch((e) => e);
    expect(error).toBeInstanceOf(AiPlanError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  });

  it("본문이 JSON이 아니면 UNKNOWN", async () => {
    await expect(parsePlanResponse(new Response("oops", { status: 500 })))
      .rejects.toMatchObject({ name: "AiPlanError", code: "UNKNOWN", status: 500 });
  });

  it("알 수 없는 error 코드는 UNKNOWN", async () => {
    await expect(parsePlanResponse(jsonRes({ error: "WHAT" }, 400))).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

describe("AiPlanError", () => {
  it("메시지와 name 형식", () => {
    const e = new AiPlanError("DAILY_LIMIT", 429);
    expect(e.message).toBe("AI 플랜 요청 실패: DAILY_LIMIT (429)");
    expect(e.name).toBe("AiPlanError");
  });
});

describe("isExpectedAiPlanError", () => {
  it("권한·한도·AI 결과 불량만 예상된 실패로 본다", () => {
    expect(isExpectedAiPlanError(new AiPlanError("PREMIUM_REQUIRED", 403))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("DAILY_LIMIT", 429))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("PLAN_INVALID", 502))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("NOT_A_GOAL", 400))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("TOO_FREQUENT", 429))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("ATTEMPT_LIMIT", 429))).toBe(true);
    expect(isExpectedAiPlanError(new AiPlanError("AI_UNAVAILABLE", 503))).toBe(false);
    expect(isExpectedAiPlanError(new AiPlanError("INVALID_INPUT", 400))).toBe(false);
    expect(isExpectedAiPlanError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

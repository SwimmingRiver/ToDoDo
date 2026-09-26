import { describe, it, expect, vi } from "vitest";

// ../../api가 authorizedFetch → @/shared/lib/firebase의 getAuth()까지 불러온다.
// CI에는 .env가 없어 auth/invalid-api-key로 던지므로 목으로 대체한다.
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: null }, googleProvider: {} }));

import { aiPlanErrorMessage } from "../aiPlanErrorMessage";
import { AiPlanError } from "../../api";

describe("aiPlanErrorMessage", () => {
  it("코드별 문구", () => {
    expect(aiPlanErrorMessage(new AiPlanError("DAILY_LIMIT", 429))).toEqual({
      title: "오늘 사용 횟수를 다 썼어요",
      message: "내일 다시 시도해 주세요",
    });
    expect(aiPlanErrorMessage(new AiPlanError("PLAN_INVALID", 502))).toEqual({
      title: "계획을 만들지 못했어요",
      message: "목표를 조금 더 구체적으로 적어주세요",
    });
    expect(aiPlanErrorMessage(new AiPlanError("INVALID_INPUT", 400))).toEqual({
      title: "입력을 확인해 주세요",
      message: "목표는 1~200자, 마감일은 오늘 이후여야 해요",
    });
  });

  it("그 밖의 실패는 재시도 안내", () => {
    const fallback = { title: "잠시 후 다시 시도해 주세요", message: "AI 응답을 받지 못했어요" };
    expect(aiPlanErrorMessage(new AiPlanError("AI_UNAVAILABLE", 503))).toEqual(fallback);
    expect(aiPlanErrorMessage(new TypeError("Failed to fetch"))).toEqual(fallback);
  });
});

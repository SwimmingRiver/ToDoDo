import { AiPlanError } from "../api";

/** PREMIUM_REQUIRED는 문구 대신 잠금 안내 화면으로 처리하므로 여기서 다루지 않는다. */
export const aiPlanErrorMessage = (error: unknown): { title: string; message: string } => {
  if (error instanceof AiPlanError) {
    if (error.code === "DAILY_LIMIT") {
      return { title: "오늘 사용 횟수를 다 썼어요", message: "내일 다시 시도해 주세요" };
    }
    if (error.code === "PLAN_INVALID") {
      return { title: "계획을 만들지 못했어요", message: "목표를 조금 더 구체적으로 적어주세요" };
    }
    if (error.code === "INVALID_INPUT") {
      return { title: "입력을 확인해 주세요", message: "목표는 1~200자, 마감일은 오늘 이후여야 해요" };
    }
  }
  return { title: "잠시 후 다시 시도해 주세요", message: "AI 응답을 받지 못했어요" };
};

import { AiPlanError, parsePlanResponse } from "@tododo/core/dist/aiPlan/index.js";
import type { GeneratePlanInput, GeneratePlanResult } from "@tododo/core/dist/aiPlan/index.js";
import { auth } from "../firebase";

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const aiProxyUrl = (): string => process.env.EXPO_PUBLIC_AI_PROXY_URL ?? "";

/**
 * AI 플랜을 요청한다. 설정·로그인·네트워크 문제는 모두 UNKNOWN AiPlanError로 바꿔,
 * 화면이 core의 기본 문구를 보여주게 한다(원인은 console.warn에 남긴다).
 */
export const requestPlan = async (input: GeneratePlanInput): Promise<GeneratePlanResult> => {
  let res: Response;
  try {
    const baseUrl = aiProxyUrl();
    if (!baseUrl) throw new Error("EXPO_PUBLIC_AI_PROXY_URL 미설정");
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const idToken = await user.getIdToken();
    res = await fetch(`${baseUrl}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.warn("[aiPlan] 요청 실패", error);
    throw new AiPlanError("UNKNOWN", 0);
  }
  return parsePlanResponse(res);
};

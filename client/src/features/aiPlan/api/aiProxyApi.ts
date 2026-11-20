import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { parsePlanResponse } from "@tododo/core/dist/aiPlan/index.js";
import type { GeneratePlanInput, GeneratePlanResult } from "@tododo/core/dist/aiPlan/index.js";

export { AiPlanError, isExpectedAiPlanError } from "@tododo/core/dist/aiPlan/index.js";
export type {
  PlanPriority,
  GeneratedPlanItem,
  GeneratedPlan,
  PlanUsage,
  GeneratePlanInput,
  GeneratePlanResult,
  AiPlanErrorCode,
} from "@tododo/core/dist/aiPlan/index.js";

const AI_PROXY_URL = import.meta.env.VITE_AI_PROXY_URL as string;

export const requestPlan = async (input: GeneratePlanInput): Promise<GeneratePlanResult> => {
  const res = await authorizedFetch(AI_PROXY_URL, "/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parsePlanResponse(res);
};

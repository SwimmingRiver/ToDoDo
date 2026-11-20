import { useMutation } from "@tanstack/react-query";
import { isExpectedAiPlanError } from "@tododo/core/dist/aiPlan/index.js";
import type { GeneratePlanInput, GeneratePlanResult } from "@tododo/core/dist/aiPlan/index.js";
import { requestPlan } from "./aiProxyApi";

export const useGeneratePlan = () =>
  useMutation<GeneratePlanResult, Error, GeneratePlanInput>({
    mutationFn: requestPlan,
    onError: (e) => {
      if (!isExpectedAiPlanError(e)) console.warn("[aiPlan]", e);
    },
  });

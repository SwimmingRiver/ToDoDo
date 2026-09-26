import { useMutation } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { requestPlan, isExpectedAiPlanError, type GeneratePlanInput } from "../api";

export const useGeneratePlan = () =>
  useMutation({
    mutationFn: (input: GeneratePlanInput) => requestPlan(input),
    onError: (error) => {
      if (!isExpectedAiPlanError(error)) {
        Sentry.captureException(error, { tags: { feature: "aiPlan" } });
      }
    },
  });

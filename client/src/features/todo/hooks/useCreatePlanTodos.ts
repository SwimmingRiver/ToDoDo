import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { createPlanTodos, type PlanSubmission } from "../api";

/**
 * 캘린더 연동 사용자의 구글 캘린더 반영은 App 전역 useSyncTodosToCalendar가
 * todos 캐시 변화로 처리하므로 여기서 따로 호출하지 않는다.
 */
export const useCreatePlanTodos = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: PlanSubmission) => createPlanTodos(submission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: (error) => {
      Sentry.captureException(error, { tags: { feature: "aiPlan" } });
    },
  });
};

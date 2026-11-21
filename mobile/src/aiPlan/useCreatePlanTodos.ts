import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPlanTodos } from "@tododo/core";
import type { PlanSubmission } from "@tododo/core/dist/aiPlan/index.js";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

/** 플랜 부모+하위를 한 번에 저장한다. 알림은 예약하지 않는다(웹과 동일). */
export const useCreatePlanTodos = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation<{ parentId: string; count: number }, Error, PlanSubmission>({
    mutationFn: (submission) => createPlanTodos(db, user!.uid, submission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
    onError: (e) => {
      console.warn("[aiPlan] 저장 실패", e);
    },
  });
};

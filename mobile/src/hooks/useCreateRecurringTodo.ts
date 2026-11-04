import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRecurringTodo, type RecurringTodoInput } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

// 반복 할 일은 모바일 로컬 알림(scheduleReminder) 대상에서 제외한다.
export const useCreateRecurringTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: RecurringTodoInput) => createRecurringTodo(db, user!.uid, todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editRecurringSeries, type RecurringTodoInput } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useEditRecurringSeries = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: RecurringTodoInput & { id: string }) =>
      editRecurringSeries(db, user!.uid, todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

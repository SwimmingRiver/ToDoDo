import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRecurringSeries } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useDeleteRecurringSeries = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(db, user!.uid, recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

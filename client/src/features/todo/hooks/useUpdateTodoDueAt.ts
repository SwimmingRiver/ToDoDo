import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodoDueAt } from "../api";

export const useUpdateTodoDueAt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      dueAt,
      startAt,
    }: {
      id: string;
      dueAt: string | null;
      startAt?: string | null;
    }) => updateTodoDueAt(id, dueAt, startAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateToDone } from "../api";

export const useUpdateToDone = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => updateToDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

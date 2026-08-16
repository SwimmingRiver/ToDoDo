import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTodo } from "../api";

export const useDeleteTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createTodo } from "../api";

export const useCreateTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
};

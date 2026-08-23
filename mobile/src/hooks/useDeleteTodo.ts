import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTodo } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useDeleteTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTodo(db, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTodo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useCreateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fields: TodoFields) => createTodo(db, user!.uid, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

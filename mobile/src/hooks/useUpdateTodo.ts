import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo, type Todo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

type UpdatePayload = {
  id: string;
  fields: Partial<TodoFields> & { status?: Todo["status"]; doneAt?: string | null };
};

export const useUpdateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fields }: UpdatePayload) => updateTodo(db, id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

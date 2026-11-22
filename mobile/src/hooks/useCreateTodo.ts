import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTodo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { scheduleReminder } from "../notifications/scheduleReminder";
import { reportError } from "../shared/lib/sentry";

export const useCreateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: TodoFields) => {
      const id = await createTodo(db, user!.uid, fields);
      try {
        await scheduleReminder({ id, title: fields.title, dueAt: fields.dueAt });
      } catch (error) {
        reportError(error, "reminder");
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

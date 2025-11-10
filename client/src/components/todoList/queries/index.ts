import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../../../types/todo.type";
import { createTodo, getTodos, editTodo, deleteTodo } from "../api";

export const useTodo = () => {
  const queryClient = useQueryClient();
  const userCreateTodo = useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const userUpdateTodo = useMutation({
    mutationFn: (todo: Todo) => editTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const userDeleteTodo = useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const userGetTodos = useQuery({
    queryKey: ["todos"],
    queryFn: getTodos,
  });
  return {
    userCreateTodo,
    userUpdateTodo,
    userDeleteTodo,
    userGetTodos,
  };
};

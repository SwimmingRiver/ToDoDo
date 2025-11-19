import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../../../types/todo.type";
import {
  createTodo,
  getTodos,
  editTodo,
  deleteTodo,
  updateToDone,
  createChildTodo,
} from "../api";

export const useTodo = () => {
  const queryClient = useQueryClient();
  const useCreateTodo = useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const useUpdateTodo = useMutation({
    mutationFn: (todo: Todo) => editTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const useDeleteTodo = useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const useGetTodos = useQuery({
    queryKey: ["todos"],
    queryFn: getTodos,
  });
  const useUpdateToDone = useMutation({
    mutationFn: (id: string) => updateToDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const useCreateChildTodo = useMutation({
    mutationFn: ({ parentId, todo }: { parentId: string; todo: Partial<Todo> }) =>
      createChildTodo(parentId, todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  return {
    useCreateTodo,
    useUpdateTodo,
    useDeleteTodo,
    useGetTodos,
    useUpdateToDone,
    useCreateChildTodo,
  };
};

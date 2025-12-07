import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import {
  createTodo,
  getTodos,
  editTodo,
  deleteTodo,
  updateToDone,
  createChildTodo,
  getTodoDetail,
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
    mutationFn: ({
      parentId,
      todo,
    }: {
      parentId: string;
      todo: Partial<Todo>;
    }) => createChildTodo(parentId, todo),
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

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};

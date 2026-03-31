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
  getSearchTodoList,
} from "../api";

export const useTodo = () => {
  const queryClient = useQueryClient();
  const useCreateTodo = useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const useGetSearchTodoList = useQuery({
    queryKey: ["searchTodoList"],
    queryFn: ({ queryKey }: { queryKey: string[] }) =>
      getSearchTodoList(queryKey[1]),
  });

  const useUpdateTodo = useMutation({
    mutationFn: (todo: Todo) => {
      const allTodos = queryClient.getQueryData<Todo[]>(["todos"]) ?? [];
      return editTodo(todo, allTodos);
    },
    onMutate: async (updatedTodo) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData<Todo[]>(["todos"]);

      queryClient.setQueryData<Todo[]>(["todos"], (old = []) => {
        const now = new Date().toISOString();
        let next = old.map((t) =>
          t.id === updatedTodo.id ? { ...t, ...updatedTodo } : t,
        );

        // 상위 done → 하위 전부 done
        if (updatedTodo.status === "done") {
          next = next.map((t) =>
            t.parentId === updatedTodo.id
              ? { ...t, status: "done" as const, doneAt: now }
              : t,
          );
        }

        // 하위 변경 → 상위 상태 재계산
        if (updatedTodo.parentId) {
          const siblings = next.filter(
            (t) => t.parentId === updatedTodo.parentId,
          );
          let newParentStatus: Todo["status"];
          if (siblings.every((s) => s.status === "done")) {
            newParentStatus = "done";
          } else if (
            siblings.some((s) => s.status === "doing" || s.status === "done")
          ) {
            newParentStatus = "doing";
          } else {
            newParentStatus = "todo";
          }
          next = next.map((t) =>
            t.id === updatedTodo.parentId
              ? {
                  ...t,
                  status: newParentStatus,
                  doneAt: newParentStatus === "done" ? now : null,
                }
              : t,
          );
        }

        return next;
      });

      return { previous };
    },
    onError: (_err, _todo, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["todos"], context.previous);
      }
    },
    onSettled: () => {
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
    }) => {
      const allTodos = queryClient.getQueryData<Todo[]>(["todos"]) ?? [];
      return createChildTodo(parentId, todo, allTodos);
    },
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
    useGetSearchTodoList,
  };
};

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};

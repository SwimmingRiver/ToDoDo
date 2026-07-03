import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import {
  createTodo,
  getTodos,
  editTodo,
  deleteTodo,
  updateToDone,
  updateTodoDueAt,
  createChildTodo,
  getTodoDetail,
  createRecurringTodo,
  editRecurringSeries,
  deleteRecurringSeries,
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

  const useUpdateTodoDueAt = useMutation({
    mutationFn: ({
      id,
      dueAt,
      startAt,
    }: {
      id: string;
      dueAt: string | null;
      startAt?: string | null;
    }) => updateTodoDueAt(id, dueAt, startAt),
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

  // 반복(recurrence)이 설정된 할 일 생성은 useCreateTodo와 별도 훅으로 분리했다.
  // 생성 시점에 이미 N개의 Todo 문서를 batch로 만들어야 해서 성공/무효화 흐름이
  // 단일 문서 생성(useCreateTodo)과 다르고, 폼(todoForm)에서 recurrence 유무에 따라
  // 호출할 훅을 명시적으로 분기하는 편이 "이 저장은 여러 문서를 만든다"는 것을
  // 호출부에서 더 명확히 드러낸다고 판단했다.
  const useCreateRecurringTodo = useMutation({
    mutationFn: (todo: Todo) => createRecurringTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  // 반복 시리즈 전체 수정(반복 OFF 전환 포함). 입력은 시리즈 대표 todo(수정 폼에서
  // 편집 중인 인스턴스)의 새 필드값 + 새 recurrence 규칙.
  const useEditRecurringSeries = useMutation({
    mutationFn: (seriesTodo: Todo) => editRecurringSeries(seriesTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  // 반복 시리즈 전체 삭제(할 일 목록에서 반복 할 일 카드 삭제 시 사용). 단일 문서만
  // 지우는 useDeleteTodo와 달리 같은 recurrenceId의 모든 인스턴스를 지운다.
  const useDeleteRecurringSeries = useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(recurrenceId),
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
    useUpdateTodoDueAt,
    useCreateChildTodo,
    useCreateRecurringTodo,
    useEditRecurringSeries,
    useDeleteRecurringSeries,
  };
};

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};

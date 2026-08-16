import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import type { Todo, TodoReorderUpdate } from "../types";
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
  runStartupMaintenance,
  reorderTodos,
  calcParentStatus,
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
          const { status: newParentStatus, doneAt } =
            calcParentStatus(siblings);
          next = next.map((t) =>
            t.id === updatedTodo.parentId
              ? { ...t, status: newParentStatus, doneAt }
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
    // 상세 페이지(useTodoDetail)는 목록과 별도의 쿼리 키(["todoDetail", id])를 쓴다.
    // ["todos"]만 무효화하면, 상세 페이지에서 저장 후 같은 항목을 staleTime(1분)
    // 안에 다시 열었을 때 무효화되지 않은 캐시가 "신선하다"고 판단되어 재조회 없이
    // 그대로 재사용된다 — 방금 저장한 필드(예: description)가 화면에 반영되지 않는
    // 버그의 원인이었다. ["todoDetail"]은 id 없이 prefix로 넘겨 해당 todo를 보고
    // 있던 모든 상세 쿼리를 함께 무효화한다.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });

  // 칸반 보드 같은 컬럼 내 드래그 재정렬(useKanbanDrag)에서 사용. 여러 문서의 order를
  // 한 번에 bulk write하는 reorderTodos를 감싼다. useUpdateTodo와 동일한 이유로
  // optimistic update를 적용한다 — 그러지 않으면 batch.commit()이 끝날 때까지 드래그로
  // 옮긴 카드가 캐시상 원래 자리로 순간적으로 스냅백되는 것처럼 보인다.
  const useReorderTodos = useMutation({
    mutationFn: (updates: TodoReorderUpdate[]) => reorderTodos(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData<Todo[]>(["todos"]);

      queryClient.setQueryData<Todo[]>(["todos"], (old = []) => {
        const orderById = new Map(updates.map((u) => [u.id, u.order]));
        return old.map((t) =>
          orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t,
        );
      });

      return { previous };
    },
    onError: (_err, _updates, context) => {
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
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
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
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
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
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
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
      // 자식 생성은 부모의 status/doneAt도 재계산해 갱신하므로(createChildTodo),
      // 부모가 상세 페이지에 열려 있다면 그 캐시도 함께 무효화해야 한다.
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
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
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });

  // 반복 시리즈 전체 수정(반복 OFF 전환 포함). 입력은 시리즈 대표 todo(수정 폼에서
  // 편집 중인 인스턴스)의 새 필드값 + 새 recurrence 규칙.
  const useEditRecurringSeries = useMutation({
    mutationFn: (seriesTodo: Todo) => editRecurringSeries(seriesTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });

  // 반복 시리즈 전체 삭제(할 일 목록에서 반복 할 일 카드 삭제 시 사용). 단일 문서만
  // 지우는 useDeleteTodo와 달리 같은 recurrenceId의 모든 인스턴스를 지운다.
  const useDeleteRecurringSeries = useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });

  // 앱 진입 시 1회 호출하는 백그라운드 유지보수(App.tsx). 완료 프로젝트 아카이빙,
  // 지난 반복 인스턴스 아카이빙, 무기한 반복 시리즈 확장을 한 번의 읽기로 처리한다.
  // 사용자 액션이 아니라 유지보수 성격이라 사용자에게는 조용히 넘어가고(다음 접속 때
  // 다시 시도됨), 실패 자체를 아무도 모르면 운영 중 문제를 감지할 수 없으므로 최소한
  // 콘솔에는 남긴다.
  //
  // 무효화를 written > 0으로 거는 이유: 세 정책 모두 대부분의 실행에서 쓸 것이 없다.
  // 무조건 무효화하면 하는 일 없이 getTodos() 전체 재조회를 유발한다. 쓴 것이 없으면
  // 서버 데이터가 이 유지보수 때문에 바뀐 게 없으므로 캐시는 이미 최신이다.
  const useRunStartupMaintenance = useMutation({
    mutationFn: () => runStartupMaintenance(),
    onSuccess: (written) => {
      if (written > 0) {
        queryClient.invalidateQueries({ queryKey: ["todos"] });
      }
    },
    onError: (error) => {
      console.error("앱 진입 유지보수 실패:", error);
      Sentry.captureException(error);
    },
  });

  return {
    useCreateTodo,
    useUpdateTodo,
    useReorderTodos,
    useDeleteTodo,
    useGetTodos,
    useUpdateToDone,
    useUpdateTodoDueAt,
    useCreateChildTodo,
    useCreateRecurringTodo,
    useEditRecurringSeries,
    useDeleteRecurringSeries,
    useRunStartupMaintenance,
  };
};

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};

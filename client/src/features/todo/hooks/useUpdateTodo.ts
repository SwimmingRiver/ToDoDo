import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { editTodo, calcParentStatus } from "../api";

export const useUpdateTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
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
};

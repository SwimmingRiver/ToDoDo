import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo, TodoReorderUpdate } from "../types";
import { reorderTodos } from "../api";

// 칸반 보드 같은 컬럼 내 드래그 재정렬(useKanbanDrag)에서 사용. 여러 문서의 order를
// 한 번에 bulk write하는 reorderTodos를 감싼다. useUpdateTodo와 동일한 이유로
// optimistic update를 적용한다 — 그러지 않으면 batch.commit()이 끝날 때까지 드래그로
// 옮긴 카드가 캐시상 원래 자리로 순간적으로 스냅백되는 것처럼 보인다.
export const useReorderTodos = () => {
  const queryClient = useQueryClient();

  return useMutation({
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
};

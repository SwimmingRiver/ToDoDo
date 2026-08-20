import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createChildTodo } from "../api";

export const useCreateChildTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
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
};

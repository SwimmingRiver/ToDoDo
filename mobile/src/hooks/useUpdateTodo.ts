import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo, type Todo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

type UpdatePayload = {
  id: string;
  fields: Partial<TodoFields> & { status?: Todo["status"]; doneAt?: string | null };
};

export const useUpdateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fields }: UpdatePayload) => {
      const allTodos = queryClient.getQueryData<Todo[]>(["todos", user?.uid]);
      // 캐시가 아예 준비되지 않은 상태([] 아니라 undefined)에서 조용히 빈
      // 배열로 넘기면 부모-자식 캐스케이드가 에러 없이 스킵되어 상태가
      // 조용히 어긋난다. 호출 시점 실수를 바로 드러내기 위해 명시적으로 던진다.
      if (!allTodos) {
        throw new Error("todos 캐시가 아직 준비되지 않았습니다");
      }
      return updateTodo(db, id, fields, allTodos);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};

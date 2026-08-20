import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createRecurringTodo } from "../api";

// 반복(recurrence)이 설정된 할 일 생성은 useCreateTodo와 별도 훅으로 분리했다.
// 생성 시점에 이미 N개의 Todo 문서를 batch로 만들어야 해서 성공/무효화 흐름이
// 단일 문서 생성(useCreateTodo)과 다르고, 폼(todoForm)에서 recurrence 유무에 따라
// 호출할 훅을 명시적으로 분기하는 편이 "이 저장은 여러 문서를 만든다"는 것을
// 호출부에서 더 명확히 드러낸다고 판단했다.
export const useCreateRecurringTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: Todo) => createRecurringTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

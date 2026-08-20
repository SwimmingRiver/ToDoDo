import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { editRecurringSeries } from "../api";

// 반복 시리즈 전체 수정(반복 OFF 전환 포함). 입력은 시리즈 대표 todo(수정 폼에서
// 편집 중인 인스턴스)의 새 필드값 + 새 recurrence 규칙.
export const useEditRecurringSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesTodo: Todo) => editRecurringSeries(seriesTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

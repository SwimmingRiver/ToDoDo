import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRecurringSeries } from "../api";

// 반복 시리즈 전체 삭제(할 일 목록에서 반복 할 일 카드 삭제 시 사용). 단일 문서만
// 지우는 useDeleteTodo와 달리 같은 recurrenceId의 모든 인스턴스를 지운다.
export const useDeleteRecurringSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};

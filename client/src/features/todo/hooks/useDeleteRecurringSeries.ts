import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRecurringSeries } from "../api";
import { ARCHIVED_TODOS_KEY } from "./useGetArchivedTodos";

// 반복 시리즈 전체 삭제(할 일 목록에서 반복 할 일 카드 삭제 시 사용). 단일 문서만
// 지우는 useDeleteTodo와 달리 같은 recurrenceId의 모든 인스턴스를 지운다.
export const useDeleteRecurringSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
      // 시리즈 삭제는 이미 보관된 회차까지 지우므로 완료 탭의 보관분도 갱신한다.
      queryClient.invalidateQueries({ queryKey: ARCHIVED_TODOS_KEY });
    },
  });
};

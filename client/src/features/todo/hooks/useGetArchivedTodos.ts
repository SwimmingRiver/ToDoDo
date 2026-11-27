import { useQuery } from "@tanstack/react-query";
import { getArchivedTodos } from "../api";

/**
 * 보관분 쿼리 키. 일부러 ["todos"] 밖에 둔다: 할 일을 고치는 훅들은 모두
 * ["todos"]를 무효화하는데, 그 아래 두면 완료 탭을 다시 열 때마다 쌓이기만 하는
 * 보관 문서 전체를 다시 읽게 된다. 보관분이 실제로 바뀌는 경로(앱 진입 스윕,
 * 반복 시리즈 삭제)에서만 이 키를 무효화한다.
 */
export const ARCHIVED_TODOS_KEY = ["archivedTodos"] as const;

/** `완료` 탭을 처음 열 때만(enabled) 보관분을 1회 읽는다. 보관함은 읽기 전용이라 오래 신선하다. */
export const useGetArchivedTodos = (enabled: boolean) =>
  useQuery({
    queryKey: ARCHIVED_TODOS_KEY,
    queryFn: getArchivedTodos,
    enabled,
    staleTime: Infinity,
  });

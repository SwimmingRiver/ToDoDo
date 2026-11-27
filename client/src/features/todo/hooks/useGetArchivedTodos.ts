import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { getArchivedTodos } from "../api";

/**
 * 보관분 쿼리 키의 앞부분(무효화용). 실제 쿼리 키는 `[...ARCHIVED_TODOS_KEY, uid]`라
 * 이 키로 무효화하면 앞부분 일치로 모든 사용자의 보관분이 함께 무효화된다.
 *
 * - 일부러 ["todos"] 밖에 둔다: 할 일을 고치는 훅들은 모두 ["todos"]를 무효화하는데,
 *   그 아래 두면 완료 탭을 다시 열 때마다 쌓이기만 하는 보관 문서 전체를 다시 읽게 된다.
 *   보관분이 실제로 바뀌는 경로(앱 진입 스윕, 반복 시리즈 삭제)에서만 무효화한다.
 * - uid를 키에 넣는다: staleTime이 Infinity이고 로그아웃은 쿼리 캐시를 비우지 않으므로,
 *   uid가 없으면 같은 탭에서 다른 계정으로 로그인했을 때 이전 사용자의 보관분이 그대로
 *   보인다(useTodosForStats의 ["todos", uid, "stats"]와 같은 방식).
 */
export const ARCHIVED_TODOS_KEY = ["archivedTodos"] as const;

/** `완료` 탭을 처음 열 때만(enabled) 보관분을 1회 읽는다. 보관함은 읽기 전용이라 오래 신선하다. */
export const useGetArchivedTodos = (enabled: boolean) => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: [...ARCHIVED_TODOS_KEY, uid],
    queryFn: getArchivedTodos,
    enabled: enabled && !!uid,
    staleTime: Infinity,
  });
};

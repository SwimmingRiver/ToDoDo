import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { fetchAllUserTodos } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { useIsPremium } from "../premium";

export const STATS_STALE_MS = 60_000;

/**
 * 통계용 전체 이력 조회. 프리미엄 전용이라 무료면 조회하지 않는다.
 * 탭은 마운트된 채 유지되므로 포커스될 때 60초가 지났으면 다시 읽는다.
 */
export const useTodosForStats = () => {
  const { user } = useAuthState();
  const uid = user?.uid;
  const { isPremium } = useIsPremium();
  const enabled = !!uid && isPremium;

  const query = useQuery({
    queryKey: ["todosForStats", uid],
    queryFn: () => fetchAllUserTodos(db, uid!),
    enabled,
    staleTime: STATS_STALE_MS,
  });

  const { refetch, dataUpdatedAt } = query;
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      // dataUpdatedAt === 0이면 첫 조회가 진행 중이거나 실패한 상태라 useQuery에 맡긴다.
      // 실패 시 자동 재조회는 하지 않는다 — isError를 deps에 넣으면 실패할 때마다 콜백이
      // 바뀌어 useFocusEffect가 다시 돌고, 오프라인이면 재조회가 끝없이 반복된다.
      // 복구는 에러 화면의 당겨서 새로고침으로 한다.
      if (dataUpdatedAt === 0) return;
      if (Date.now() - dataUpdatedAt > STATS_STALE_MS) void refetch();
    }, [enabled, dataUpdatedAt, refetch]),
  );

  return query;
};

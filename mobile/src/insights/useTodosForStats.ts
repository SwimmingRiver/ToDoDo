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

  const { refetch, dataUpdatedAt, isError } = query;
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      // 첫 조회가 실패한 채 데이터가 없으면 포커스 때 바로 다시 읽는다.
      if (dataUpdatedAt === 0 && isError) {
        void refetch();
        return;
      }
      // dataUpdatedAt === 0이면 첫 조회가 진행 중이라 useQuery에 맡긴다.
      if (dataUpdatedAt === 0) return;
      if (Date.now() - dataUpdatedAt > STATS_STALE_MS) void refetch();
    }, [enabled, dataUpdatedAt, isError, refetch]),
  );

  return query;
};

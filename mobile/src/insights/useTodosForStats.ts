import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { fetchAllUserTodos } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { useIsPremium } from "../premium";

export const STATS_STALE_MS = 60_000;

/**
 * 통계용 전체 이력 조회. 프리미엄 전용이라 무료면 조회하지 않는다.
 * 탭은 마운트된 채 유지되므로 포커스될 때, 그리고 통계 탭이 보이는 채 앱이 다시
 * 활성화될 때(포커스 이벤트가 나지 않음) 60초가 지났으면 다시 읽는다.
 */
export const useTodosForStats = () => {
  const { user } = useAuthState();
  const uid = user?.uid;
  const { isPremium } = useIsPremium();
  const isFocused = useIsFocused();
  const enabled = !!uid && isPremium;

  const query = useQuery({
    // ["todos", uid] 아래에 둔다 — 할 일을 바꾸는 동작은 모두 ["todos", uid]를 무효화하므로
    // (앞부분 일치) 따로 배선하지 않아도 할 일이 바뀌면 통계도 다시 읽는다.
    queryKey: ["todos", uid, "stats"],
    queryFn: () => fetchAllUserTodos(db, uid!),
    // 탭은 마운트된 채 남아 쿼리가 계속 '사용 중'이라, 안 보일 때도 켜 두면 다른 탭에서 할 일을
    // 바꿀 때마다 전체 이력을 읽는다. 안 보일 때는 끄고(무효화는 표시만 됨) 다시 보일 때 오래됐으면 읽는다.
    enabled: enabled && isFocused,
    staleTime: STATS_STALE_MS,
  });

  // 콜백을 안정적으로 유지하려고 최신 값은 ref로 읽는다 — deps에 넣으면 값이 바뀔 때마다
  // useFocusEffect가 다시 돌아 포커스가 아닌데도 재조회 판정이 일어난다.
  const latest = useRef({ enabled, dataUpdatedAt: query.dataUpdatedAt, refetch: query.refetch });
  latest.current = { enabled, dataUpdatedAt: query.dataUpdatedAt, refetch: query.refetch };

  const refetchIfStale = useCallback(() => {
    const { enabled: isEnabled, dataUpdatedAt, refetch } = latest.current;
    if (!isEnabled) return;
    // dataUpdatedAt === 0이면 첫 조회가 진행 중이거나 실패한 상태라 useQuery에 맡긴다.
    // 실패 시 자동 재조회는 하지 않는다 — 오프라인이면 재조회가 끝없이 반복될 수 있다.
    // 복구는 에러 화면의 당겨서 새로고침으로 한다.
    if (dataUpdatedAt === 0) return;
    if (Date.now() - dataUpdatedAt > STATS_STALE_MS) void refetch();
  }, []);

  useFocusEffect(refetchIfStale);

  useEffect(() => {
    if (!isFocused) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refetchIfStale();
    });
    return () => sub.remove();
  }, [isFocused, refetchIfStale]);

  return query;
};

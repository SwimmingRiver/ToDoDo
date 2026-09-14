import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { useIsPremium } from "@/features/entitlement";
import { getAllTodosForStats } from "../api";

export const useTodosForStats = () => {
  const uid = auth.currentUser?.uid;
  const { isPremium } = useIsPremium();
  return useQuery({
    queryKey: ["todosForStats", uid],
    queryFn: getAllTodosForStats,
    // 프리미엄이 아니면 전체 todo 이력을 가져올 필요가 없다 — calendarIntegration의
    // 동일한 게이팅 패턴(enabled에 isPremium 포함)을 그대로 따른다.
    enabled: !!uid && isPremium,
    // 통계는 실시간 정합성이 중요하지 않고, todo 뮤테이션마다 이 쿼리를
    // 무효화하는 배선은 회귀 위험 대비 이득이 작아 의도적으로 하지 않는다
    // (client/CLAUDE.md 참고). 대신 staleTime을 길게 둔다.
    staleTime: 5 * 60 * 1000,
  });
};

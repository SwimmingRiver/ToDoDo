import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { useIsPremium } from "@/features/entitlement";
import { getAllTodosForStats } from "../api";

export const useTodosForStats = () => {
  const uid = auth.currentUser?.uid;
  const { isPremium } = useIsPremium();
  return useQuery({
    // ["todos"] 아래에 둔다 — 할 일을 바꾸는 동작은 모두 ["todos"]를 무효화하므로(앞부분 일치)
    // 따로 배선하지 않아도 할 일이 바뀌면 통계도 함께 다시 읽는다. 인사이트 화면을 떠나 있으면
    // 오래됨 표시만 되고 실제 조회는 다음 진입 때 한 번 한다.
    queryKey: ["todos", uid, "stats"],
    queryFn: getAllTodosForStats,
    // 프리미엄이 아니면 전체 todo 이력을 가져올 필요가 없다 — calendarIntegration의
    // 동일한 게이팅 패턴(enabled에 isPremium 포함)을 그대로 따른다.
    enabled: !!uid && isPremium,
    // 이 기기의 변경은 위 무효화로 즉시 반영된다. 다른 기기(앱 등)의 변경은 무효화로 잡히지
    // 않으므로 60초가 지나면 화면 진입·창 복귀 때 다시 읽는다(앱 STATS_STALE_MS와 같은 기준).
    staleTime: 60 * 1000,
  });
};

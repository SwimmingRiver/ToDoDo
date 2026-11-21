import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGoogleCalendarEvents, CalendarRevokedError } from "./calendarProxyApi";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";
import { markCalendarRevoked } from "./markCalendarRevoked";
import { useIsPremium } from "../premium";

export interface CalendarVisibleRange {
  /** ISO 타임스탬프. 구글 API의 timeMax와 같이 end는 배타적이다. */
  start: string;
  end: string;
}

/** 캘린더가 보여주는 달의 구글 이벤트를 조회한다(웹 useGoogleCalendarEvents와 같은 규칙).
 *  범위를 모르거나 미연동·revoked·비프리미엄이면 조회하지 않는다. */
export const useGoogleCalendarEvents = (range: CalendarVisibleRange | null) => {
  const { data: integration } = useCalendarIntegrationStatus();
  const { isPremium } = useIsPremium();
  const queryClient = useQueryClient();

  const query = useQuery({
    // 연동 해제 시 removeQueries({ queryKey: ["googleCalendarEvents"] })가 prefix 매칭으로
    // 모든 범위의 캐시를 함께 지우도록 첫 원소는 고정한다.
    queryKey: ["googleCalendarEvents", range?.start, range?.end],
    queryFn: async () => {
      try {
        return await getGoogleCalendarEvents({ timeMin: range!.start, timeMax: range!.end });
      } catch (error) {
        // 철회된 토큰은 재시도해도 소용없다 — revoked로 기록해 이 쿼리를 끄고
        // 연결 줄이 "다시 연결" 안내로 바뀌게 한다.
        if (error instanceof CalendarRevokedError) await markCalendarRevoked(queryClient);
        throw error;
      }
    },
    retry: (failureCount, error) => !(error instanceof CalendarRevokedError) && failureCount < 3,
    // 달을 앞뒤로 오갈 때마다 프록시를 다시 치지 않도록 잠시 신선하게 본다.
    staleTime: 60_000,
    // 세션 중 프리미엄이 만료되면 상태 쿼리는 꺼져도 캐시된 connected:true가 남는다 —
    // isPremium을 직접 봐야 403과 강제 토큰 갱신이 반복되지 않는다.
    enabled: isPremium && !!range && !!integration?.connected && integration.status !== "revoked",
  });
  // 꺼진 쿼리도 캐시된 data는 그대로 돌려준다. 잠금 안내 아래에 옛 구글 점·줄이 남지 않게
  // 비프리미엄이면 data를 비워 내보낸다.
  return isPremium ? query : { ...query, data: undefined };
};

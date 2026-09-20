import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGoogleCalendarEvents, CalendarRevokedError } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";
import { markCalendarRevoked } from "./markCalendarRevoked";

export interface CalendarVisibleRange {
  /** ISO 타임스탬프. FullCalendar datesSet의 start/end와 같이 end는 배타적이다 —
   *  구글 API의 timeMax도 배타적이라 그대로 매핑한다. */
  start: string;
  end: string;
}

/** 캘린더가 실제로 보여주는 범위의 구글 이벤트를 조회한다. 범위를 아직 모르면
 *  (FullCalendar가 datesSet을 아직 안 쐈으면) 조회하지 않는다. */
export const useGoogleCalendarEvents = (range: CalendarVisibleRange | null) => {
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();

  return useQuery({
    // 연동 해제 시 removeQueries({ queryKey: ["googleCalendarEvents"] })가 prefix
    // 매칭으로 모든 범위의 캐시를 함께 지우도록 첫 원소는 고정한다.
    queryKey: ["googleCalendarEvents", range?.start, range?.end],
    queryFn: async () => {
      try {
        return await getGoogleCalendarEvents({ timeMin: range!.start, timeMax: range!.end });
      } catch (error) {
        // 철회된 토큰은 재시도해도 소용없다 — 상태를 revoked로 바꿔 이 쿼리를
        // disabled로 만들고 "다시 연결" 안내가 뜨게 한다.
        if (error instanceof CalendarRevokedError) await markCalendarRevoked(queryClient);
        throw error;
      }
    },
    retry: (failureCount, error) =>
      !(error instanceof CalendarRevokedError) && failureCount < 3,
    // 달을 앞뒤로 오갈 때마다 프록시를 다시 치지 않도록 잠시 신선하게 본다.
    staleTime: 60 * 1000,
    enabled: !!range && !!integration?.connected && integration.status !== "revoked",
  });
};

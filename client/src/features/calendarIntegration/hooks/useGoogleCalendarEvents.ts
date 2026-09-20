import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGoogleCalendarEvents, CalendarRevokedError } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";
import { markCalendarRevoked } from "./markCalendarRevoked";

export const useGoogleCalendarEvents = () => {
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["googleCalendarEvents"],
    queryFn: async () => {
      try {
        return await getGoogleCalendarEvents();
      } catch (error) {
        // 철회된 토큰은 재시도해도 소용없다 — 상태를 revoked로 바꿔 이 쿼리를
        // disabled로 만들고 "다시 연결" 안내가 뜨게 한다.
        if (error instanceof CalendarRevokedError) await markCalendarRevoked(queryClient);
        throw error;
      }
    },
    retry: (failureCount, error) =>
      !(error instanceof CalendarRevokedError) && failureCount < 3,
    enabled: !!integration?.connected && integration.status !== "revoked",
  });
};

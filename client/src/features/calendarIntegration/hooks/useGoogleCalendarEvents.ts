import { useQuery } from "@tanstack/react-query";
import { getGoogleCalendarEvents } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";

export const useGoogleCalendarEvents = () => {
  const { data: integration } = useCalendarIntegrationStatus();

  return useQuery({
    queryKey: ["googleCalendarEvents"],
    queryFn: getGoogleCalendarEvents,
    enabled: !!integration?.connected && integration.status !== "revoked",
  });
};

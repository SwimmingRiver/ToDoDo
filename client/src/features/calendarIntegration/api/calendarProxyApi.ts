import {
  CalendarRevokedError,
  CalendarNotConnectedError,
  parseOAuthStartResponse,
  parseSyncResponse,
  parseEventsResponse,
  parseDisconnectResponse,
  type SyncTodoPayload,
  type SyncTodoResult,
  type GoogleCalendarEvent,
  type DisconnectResult,
} from "@tododo/core/dist/calendarSync/index.js";
import { authorizedFetch as authorizedFetchTo } from "@/shared/lib/authorizedFetch";

const CALENDAR_PROXY_URL = import.meta.env.VITE_CALENDAR_PROXY_URL as string;

const authorizedFetch = (path: string, init: RequestInit = {}): Promise<Response> =>
  authorizedFetchTo(CALENDAR_PROXY_URL, path, init);

export { CalendarRevokedError, CalendarNotConnectedError };
export type { SyncTodoPayload, SyncTodoResult, GoogleCalendarEvent, DisconnectResult };

export const getOAuthStartUrl = async (): Promise<string> =>
  parseOAuthStartResponse(await authorizedFetch("/oauth/start"));

export const syncTodosToCalendar = async (
  todos: SyncTodoPayload[],
): Promise<SyncTodoResult[]> =>
  parseSyncResponse(
    await authorizedFetch("/sync-todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos }),
    }),
  );

export interface GoogleCalendarEventsRange {
  /** ISO 타임스탬프. 구글 API와 같이 timeMax는 배타적(exclusive)이다. */
  timeMin: string;
  timeMax: string;
}

export const getGoogleCalendarEvents = async (
  range: GoogleCalendarEventsRange,
): Promise<GoogleCalendarEvent[]> => {
  const params = new URLSearchParams({ timeMin: range.timeMin, timeMax: range.timeMax });
  return parseEventsResponse(await authorizedFetch(`/events?${params.toString()}`));
};

export const disconnectCalendar = async (googleEventIds: string[]): Promise<DisconnectResult> =>
  parseDisconnectResponse(
    await authorizedFetch("/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ googleEventIds }),
    }),
  );

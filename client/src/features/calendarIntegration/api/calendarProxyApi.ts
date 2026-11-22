import {
  CalendarRevokedError,
  CalendarNotConnectedError,
  parseOAuthStartResponse,
  parseSyncResponse,
  parseEventsResponse,
  parseDisconnectResponse,
  disconnectInChunks,
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

/** 연동 해제. Worker(무료 플랜)는 요청당 서브리퀘스트가 50개라 이벤트를 10개씩 나눠 순서대로
 *  보낸다 — 마지막 요청 전까지는 keepToken:true로 토큰을 남기고, 마지막 요청에서만 토큰을
 *  지운다. 중간 요청이 실패하면 throw(토큰이 남아 있어 다시 시도할 수 있다). 연동 해제
 *  훅과 탈퇴(deleteAccount) 모두 이 함수를 쓴다. */
export const disconnectCalendar = async (googleEventIds: string[]): Promise<DisconnectResult> =>
  disconnectInChunks(googleEventIds, async (chunk, keepToken) =>
    parseDisconnectResponse(
      await authorizedFetch("/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keepToken ? { googleEventIds: chunk, keepToken: true } : { googleEventIds: chunk }),
      }),
    ),
  );

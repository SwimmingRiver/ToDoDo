import { CalendarNotConnectedError, CalendarRevokedError } from "./errors.js";
import type { DisconnectResult, GoogleCalendarEvent, SyncTodoResult } from "./types.js";

const readErrorCode = async (res: Response): Promise<string | undefined> => {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error;
};

export const parseOAuthStartResponse = async (res: Response): Promise<string> => {
  if (!res.ok) throw new Error("OAuth 시작 실패");
  const data = (await res.json()) as { authUrl: string };
  return data.authUrl;
};

export const parseSyncResponse = async (res: Response): Promise<SyncTodoResult[]> => {
  if (res.status === 401) {
    if ((await readErrorCode(res)) === "revoked") throw new CalendarRevokedError();
    throw new Error(`동기화 실패: ${res.status}`);
  }
  if (res.status === 409) {
    if ((await readErrorCode(res)) === "not_connected") throw new CalendarNotConnectedError();
    throw new Error(`동기화 실패: ${res.status}`);
  }
  if (!res.ok) throw new Error(`동기화 실패: ${res.status}`);
  const data = (await res.json()) as { results: SyncTodoResult[] };
  return data.results;
};

export const parseEventsResponse = async (res: Response): Promise<GoogleCalendarEvent[]> => {
  if (res.status === 401) {
    if ((await readErrorCode(res)) === "revoked") throw new CalendarRevokedError();
    throw new Error("이벤트 조회 실패: 401");
  }
  if (!res.ok) throw new Error("이벤트 조회 실패");
  const data = (await res.json()) as { events: GoogleCalendarEvent[] };
  return data.events;
};

export const parseDisconnectResponse = async (res: Response): Promise<DisconnectResult> => {
  if (!res.ok) throw new Error("연동 해제 실패");
  const data = (await res.json().catch(() => ({}))) as { deletedGoogleEventIds?: string[] };
  return { deletedGoogleEventIds: data.deletedGoogleEventIds ?? [] };
};

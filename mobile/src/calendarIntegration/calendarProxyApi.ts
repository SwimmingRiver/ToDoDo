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
import { auth } from "../firebase";

export { CalendarRevokedError, CalendarNotConnectedError };
export type { SyncTodoPayload, SyncTodoResult, GoogleCalendarEvent, DisconnectResult };

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const calendarProxyUrl = (): string => process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL ?? "";

/** 본문은 한 번만 읽을 수 있으므로 clone으로 확인해 원본 응답을 그대로 파서에 넘긴다. */
const isPremiumRequired = async (res: Response): Promise<boolean> => {
  try {
    const body = (await res.clone().json()) as { error?: string };
    return body?.error === "PREMIUM_REQUIRED";
  } catch {
    return false;
  }
};

const authorizedFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const baseUrl = calendarProxyUrl();
  if (!baseUrl) throw new Error("EXPO_PUBLIC_CALENDAR_PROXY_URL 미설정");
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const send = async (forceRefresh: boolean): Promise<Response> => {
    const idToken = forceRefresh ? await user.getIdToken(true) : await user.getIdToken();
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${idToken}` },
    });
  };
  const res = await send(false);
  // 구독 직후에는 캐시된 ID 토큰에 프리미엄 클레임이 없어 403이 난다. 토큰을 갱신해 한 번만 재시도한다.
  if (res.status === 403 && (await isPremiumRequired(res))) return send(true);
  return res;
};

/** client=app이면 Worker 콜백이 웹 대신 tododo://calendar 딥링크로 복귀시킨다. */
export const getOAuthStartUrl = async (): Promise<string> =>
  parseOAuthStartResponse(await authorizedFetch("/oauth/start?client=app"));

export const syncTodosToCalendar = async (todos: SyncTodoPayload[]): Promise<SyncTodoResult[]> =>
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

export const getGoogleCalendarEvents = async (range: GoogleCalendarEventsRange): Promise<GoogleCalendarEvent[]> => {
  // RN의 URLSearchParams 폴리필은 일부 메서드가 미구현이라 직접 인코딩한다.
  const query = `timeMin=${encodeURIComponent(range.timeMin)}&timeMax=${encodeURIComponent(range.timeMax)}`;
  return parseEventsResponse(await authorizedFetch(`/events?${query}`));
};

/** 연동 해제(웹 disconnectCalendar와 같은 동작). Worker(무료 플랜)는 요청당 서브리퀘스트가
 *  50개라 이벤트를 10개씩 나눠 순서대로 보낸다 — 마지막 요청 전까지는 keepToken:true로 토큰을
 *  남기고, 마지막 요청에서만 토큰을 지운다. 중간 요청이 실패하면 throw(토큰이 남아 다시
 *  시도할 수 있다). */
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

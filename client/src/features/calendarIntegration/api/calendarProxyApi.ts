import { auth } from "@/shared/lib/firebase";

const CALENDAR_PROXY_URL = import.meta.env.VITE_CALENDAR_PROXY_URL as string;

const authorizedFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();
  return fetch(`${CALENDAR_PROXY_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
};

export const getOAuthStartUrl = async (): Promise<string> => {
  const res = await authorizedFetch("/oauth/start");
  if (!res.ok) throw new Error("OAuth 시작 실패");
  const data = (await res.json()) as { authUrl: string };
  return data.authUrl;
};

export interface SyncTodoPayload {
  id: string;
  title: string;
  /** "YYYY-MM-DD" 로컬 캘린더 날짜 키. ISO 타임스탬프가 아니다 — 호출부(useSyncTodosToCalendar)가
   *  toDateKeyFromISO로 변환해서 채운다. */
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncTodoResult {
  id: string;
  googleEventId: string | null;
  /** 이 항목이 실패했을 때만 채워진다. 있으면 googleEventId는 신뢰하지 말고,
   *  이 항목은 다음 동기화 실행에서 다시 시도되도록 둔다(스냅샷 갱신 안 함). */
  error?: string;
}

export const syncTodosToCalendar = async (
  todos: SyncTodoPayload[],
): Promise<SyncTodoResult[]> => {
  const res = await authorizedFetch("/sync-todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  });
  if (!res.ok) throw new Error(`동기화 실패: ${res.status}`);
  const data = (await res.json()) as { results: SyncTodoResult[] };
  return data.results;
};

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

export const getGoogleCalendarEvents = async (): Promise<GoogleCalendarEvent[]> => {
  const res = await authorizedFetch("/events");
  if (!res.ok) throw new Error("이벤트 조회 실패");
  const data = (await res.json()) as { events: GoogleCalendarEvent[] };
  return data.events;
};

export const disconnectCalendar = async (googleEventIds: string[]): Promise<void> => {
  const res = await authorizedFetch("/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ googleEventIds }),
  });
  if (!res.ok) throw new Error("연동 해제 실패");
};

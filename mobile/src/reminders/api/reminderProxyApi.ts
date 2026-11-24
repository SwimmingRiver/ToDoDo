import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";
import { auth } from "../../firebase";

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const reminderProxyUrl = (): string => process.env.EXPO_PUBLIC_REMINDER_PROXY_URL ?? "";

const authorizedFetch = async (baseUrl: string, path: string, init: RequestInit): Promise<Response> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${idToken}` },
  });
};

/** URL이 없으면(로컬 개발 등) 조용히 건너뛴다 — 웹과 같다. */
const call = async (path: string, init: RequestInit): Promise<void> => {
  const baseUrl = reminderProxyUrl();
  if (!baseUrl) return;
  const res = await authorizedFetch(baseUrl, path, init);
  if (!res.ok) throw new Error(`reminder-proxy ${path} 실패: ${res.status}`);
};

export const registerPushToken = (token: string, platform: string): Promise<void> =>
  call("/push-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });

export const unregisterPushToken = (token: string): Promise<void> =>
  call("/push-tokens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

export const requestReminderRefresh = (): Promise<void> => call("/reminders/refresh", { method: "POST" });

/** reminder-proxy `GET /reminders/history` 응답. 서버의 HistoryResponse와 같은 모양이다. */
export interface ReminderHistoryItem {
  todoId: string;
  title: string;
  offsetMinutes: ReminderOffsetMinutes;
  dueAt: string;
  sentAt: number;
}

export interface ReminderHistory {
  items: ReminderHistoryItem[];
  lastSeenAt: number;
}

export const fetchReminderHistory = async (): Promise<ReminderHistory> => {
  const baseUrl = reminderProxyUrl();
  if (!baseUrl) return { items: [], lastSeenAt: 0 };
  const res = await authorizedFetch(baseUrl, "/reminders/history", { method: "GET" });
  if (!res.ok) throw new Error(`reminder-proxy /reminders/history 실패: ${res.status}`);
  return (await res.json()) as ReminderHistory;
};

export const markReminderHistorySeen = (seenUntil: number): Promise<void> =>
  call("/reminders/history/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seenUntil }),
  });

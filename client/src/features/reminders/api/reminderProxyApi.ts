import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";

const REMINDER_PROXY_URL = (import.meta.env.VITE_REMINDER_PROXY_URL as string | undefined) ?? "";

/** URL이 없으면(로컬 개발 등) 조용히 건너뛴다 — 안 그러면 할 일을 바꿀 때마다 에러가 Sentry로 간다. */
const call = async (path: string, init: RequestInit): Promise<void> => {
  if (!REMINDER_PROXY_URL) return;
  const res = await authorizedFetch(REMINDER_PROXY_URL, path, init);
  if (!res.ok) throw new Error(`reminder-proxy ${path} 실패: ${res.status}`);
};

export const registerPushToken = (token: string): Promise<void> =>
  call("/push-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "web" }),
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
  if (!REMINDER_PROXY_URL) return { items: [], lastSeenAt: 0 };
  const res = await authorizedFetch(REMINDER_PROXY_URL, "/reminders/history", { method: "GET" });
  if (!res.ok) throw new Error(`reminder-proxy /reminders/history 실패: ${res.status}`);
  return (await res.json()) as ReminderHistory;
};

export const markReminderHistorySeen = (seenUntil: number): Promise<void> =>
  call("/reminders/history/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seenUntil }),
  });

/** 탈퇴: 이 사용자의 푸시 토큰·알림 기록·예약 알람을 모두 지운다. */
export const deleteReminderAccount = (): Promise<void> => call("/account", { method: "DELETE" });

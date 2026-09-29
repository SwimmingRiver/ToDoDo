import { authorizedFetch } from "@/shared/lib/authorizedFetch";

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

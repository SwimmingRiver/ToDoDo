export type PushPermission = NotificationPermission | "unsupported";

/** iOS의 일반 브라우저(홈 화면 PWA가 아닌)는 PushManager가 없어 여기서 걸러진다. */
export const isPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "PushManager" in window &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator;

export const getPushPermission = (): PushPermission =>
  isPushSupported() ? Notification.permission : "unsupported";

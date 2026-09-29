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

/**
 * 권한 변경 알림. 브라우저에는 신뢰할 만한 권한 변경 이벤트가 없어서, 권한을 요청한
 * 쪽(enablePushOnThisDevice)이 직접 알린다. 앱 마운트 시 한 번 구독한 포그라운드
 * 수신 훅이 이 신호로 다시 구독해야 "켜기"를 누른 그 세션에서도 알림을 받는다.
 */
const permissionListeners = new Set<() => void>();

export const onPushPermissionChanged = (listener: () => void): (() => void) => {
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
};

export const notifyPushPermissionChanged = (): void => {
  permissionListeners.forEach((listener) => listener());
};

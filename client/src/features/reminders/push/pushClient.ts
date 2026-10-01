import type { Messaging } from "firebase/messaging";
import { registerPushToken, unregisterPushToken } from "../api/reminderProxyApi";
import { getPushPermission, notifyPushPermissionChanged, type PushPermission } from "./pushSupport";
import { waitForActiveWorker } from "./waitForActiveWorker";

export { getPushPermission, isPushSupported } from "./pushSupport";
export type { PushPermission } from "./pushSupport";

const SW_PATH = "/firebase-messaging-sw.js";
/** FCM SDK 기본 스코프. 앱 전체(/) 스코프를 차지하지 않아 다른 워커와 충돌하지 않는다. */
const SW_SCOPE = "/firebase-cloud-messaging-push-scope";

const serviceWorkerUrl = (): string => {
  const params = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  });
  return `${SW_PATH}?${params.toString()}`;
};

/** firebase/messaging은 여기서만 동적으로 불러온다(첫 화면 번들에 넣지 않는다). */
const loadMessaging = async (): Promise<{ messaging: Messaging; sdk: typeof import("firebase/messaging") }> => {
  const [sdk, { app }] = await Promise.all([import("firebase/messaging"), import("@/shared/lib/firebaseApp")]);
  return { messaging: sdk.getMessaging(app), sdk };
};

const getCurrentToken = async (): Promise<{ token: string; messaging: Messaging; sdk: typeof import("firebase/messaging") }> => {
  const { messaging, sdk } = await loadMessaging();
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: SW_SCOPE });
  // 첫 등록 직후엔 워커가 installing이라 바로 구독하면 실패한다(waitForActiveWorker 주석 참고).
  await waitForActiveWorker(registration);
  const token = await sdk.getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  return { token, messaging, sdk };
};

/**
 * 로그아웃 정리(FCM 토큰 삭제)가 끝나지 않았다는 표시. 오프라인 로그아웃 등으로 삭제가 실패하면
 * 토큰이 살아 있는 채 이전 계정의 DO에 남는다(옛 계정 ID 토큰이 없어 Worker에서 대신 지울 수도 없다).
 * 다음 계정이 그 토큰을 그대로 등록하면 이전 계정의 알림이 이 브라우저에 오므로, 등록 전에 먼저 지운다.
 */
const RELEASE_PENDING_KEY = "tododo:pushReleasePending";

const hasPendingRelease = (): boolean => {
  try {
    return localStorage.getItem(RELEASE_PENDING_KEY) === "1";
  } catch {
    return false;
  }
};

const setPendingRelease = (pending: boolean): void => {
  try {
    if (pending) localStorage.setItem(RELEASE_PENDING_KEY, "1");
    else localStorage.removeItem(RELEASE_PENDING_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 모드 등)은 복구 표시 없이 진행한다.
  }
};

/** 권한이 있으면 현재 토큰을 Worker에 등록한다. upsert라 여러 번 불러도 된다. */
export const syncPushToken = async (): Promise<void> => {
  if (getPushPermission() !== "granted") return;
  if (hasPendingRelease()) {
    // deleteToken은 워커 등록이 붙은 messaging이 필요해 getCurrentToken을 거친다. 이 옛 토큰은 등록하지 않는다.
    // 삭제가 실패하면 던져서 옛 토큰이 새 계정에 등록되지 않게 하고, 다음 동기화에서 다시 시도한다.
    const { messaging, sdk } = await getCurrentToken();
    await sdk.deleteToken(messaging);
    setPendingRelease(false);
  }
  const { token } = await getCurrentToken();
  await registerPushToken(token);
};

export const enablePushOnThisDevice = async (): Promise<PushPermission> => {
  if (getPushPermission() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  notifyPushPermissionChanged();
  if (permission === "granted") await syncPushToken();
  return permission;
};

/** 로그아웃 시: 이 브라우저가 다음 사용자에게 이전 계정의 알림을 받지 않게 한다. */
export const disablePushOnThisDevice = async (): Promise<void> => {
  if (getPushPermission() !== "granted") return;
  // 어느 단계에서 실패하든 표시가 남아, 다음 syncPushToken이 옛 토큰부터 지운다.
  setPendingRelease(true);
  const { token, messaging, sdk } = await getCurrentToken();
  try {
    await unregisterPushToken(token);
  } finally {
    // Worker 호출이 실패해도 FCM 토큰은 무효화한다. 그러면 옛 DO가 다음 발송에서
    // UNREGISTERED를 받아 스스로 토큰을 버린다. 원래 에러는 그대로 전파된다.
    await sdk.deleteToken(messaging);
    setPendingRelease(false);
  }
};

/** 탭이 포커스된 상태에서는 FCM이 알림을 자동 표시하지 않으므로 앱이 직접 보여준다. */
export const subscribeForegroundMessages = async (
  handler: (message: { title: string; body: string }) => void,
): Promise<() => void> => {
  if (getPushPermission() !== "granted") return () => {};
  const { messaging, sdk } = await loadMessaging();
  return sdk.onMessage(messaging, (payload) => {
    handler({ title: payload.notification?.title ?? "", body: payload.notification?.body ?? "" });
  });
};

import { Platform } from "react-native";
import {
  AuthorizationStatus,
  deleteToken,
  getMessaging,
  getToken,
  hasPermission,
  requestPermission,
} from "@react-native-firebase/messaging";
import { registerPushToken, unregisterPushToken } from "../api/reminderProxyApi";
import { clearReleasePending, loadReleasePending, saveReleasePending, type ReleasePending } from "./releasePending";

export type PushPermission = "granted" | "denied" | "undetermined";

const toPushPermission = (status: number): PushPermission => {
  switch (status) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
    case AuthorizationStatus.EPHEMERAL:
      return "granted";
    case AuthorizationStatus.DENIED:
      return "denied";
    default:
      return "undetermined";
  }
};

export const getPushPermission = async (): Promise<PushPermission> =>
  toPushPermission(await hasPermission(getMessaging()));

/**
 * 권한 변경 알림(같은 세션 안 상태 갱신용). 권한을 요청한 쪽(enablePushOnThisDevice)이 직접 알린다.
 */
const permissionListeners = new Set<() => void>();

export const subscribePushPermissionChanged = (listener: () => void): (() => void) => {
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
};

export const notifyPushPermissionChanged = (): void => {
  permissionListeners.forEach((listener) => listener());
};

/**
 * 이전 로그아웃에서 끝나지 않은 해제를 마저 한다. 실패하면 던진다 — 호출부는 등록하지 않는다.
 * 기기 토큰을 먼저 지워야 getToken()이 앞 계정의 토큰을 그대로 돌려주지 않는다(스펙 §5.6).
 */
const resolveReleasePending = async (pending: ReleasePending, uid: string): Promise<void> => {
  let current = pending;
  if (!current.deviceDeleted) {
    await deleteToken(getMessaging());
    current = { ...current, deviceDeleted: true };
    await saveReleasePending(current);
  }
  // 다른 계정의 ID 토큰으로는 지울 수 없다. 기기 토큰이 무효가 됐으니 옛 DO의 토큰은
  // 다음 발송 때 UNREGISTERED로 정리된다. 토큰을 못 받은 기록("")도 서버 삭제는 건너뛴다.
  if (!current.serverDeleted && current.uid === uid && current.token) {
    await unregisterPushToken(current.token);
  }
  await clearReleasePending();
};

const syncPushTokenRaw = async (uid: string): Promise<void> => {
  const pending = await loadReleasePending();
  if (pending) await resolveReleasePending(pending, uid);
  if ((await getPushPermission()) !== "granted") return;
  const token = await getToken(getMessaging());
  await registerPushToken(token, Platform.OS);
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};
const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type QueuedSync = Deferred & { uid: string };
type QueuedDisable = Deferred & { uid: string };

/**
 * 동기화와 해제는 하나의 모듈 수준 큐를 공유한다(getToken/deleteToken이 겹치면 다른 계정의 토큰을
 * 지우거나, 해제 중인 계정에 새 토큰을 등록할 수 있다).
 *
 * - 한 번에 하나만 돈다. 대기열은 해제(도착 순) → 후행 동기화 하나 순이다.
 * - 해제가 들어오면 그때까지 대기 중이던 후행 동기화는 버린다.
 * - 해제가 끝날 때 대기 중인 후행 동기화가 같은 uid면 버린다(로그아웃 중인 계정에 다시 등록하지 않는다).
 *   다른 uid(다음 계정)면 해제 뒤에 돌아 남은 해제 대기를 처리한다.
 */
let running: Promise<void> | null = null;
let queuedSync: QueuedSync | null = null;
const queuedDisables: QueuedDisable[] = [];

const dropQueuedSync = (): void => {
  const dropped = queuedSync;
  queuedSync = null;
  dropped?.resolve();
};

const runExclusive = (op: () => Promise<void>, onDone?: () => void): Promise<void> => {
  const run = op();
  running = run;
  const after = () => {
    running = null;
    onDone?.();
    const nextDisable = queuedDisables.shift();
    if (nextDisable) {
      startDisable(nextDisable.uid).then(nextDisable.resolve, nextDisable.reject);
      return;
    }
    const next = queuedSync;
    queuedSync = null;
    if (next) runExclusive(() => syncPushTokenRaw(next.uid)).then(next.resolve, next.reject);
  };
  run.then(after, after);
  return run;
};

const startDisable = (uid: string): Promise<void> =>
  runExclusive(
    () => disablePushRaw(uid),
    () => {
      if (queuedSync?.uid === uid) dropQueuedSync();
    },
  );

/**
 * 끝나지 않은 해제가 있으면 권한과 무관하게 먼저 처리하고(실패하면 던진다), 권한이 있을 때만
 * 현재 토큰을 Worker에 등록한다. upsert라 여러 번 불러도 된다.
 *
 * 해제와 같은 큐로 직렬화한다. 실행 중에 온 호출은 끝난 뒤 한 번만 더 도는 후행 실행 하나로 합치고,
 * 그 사이 호출한 쪽의 uid가 가장 마지막 것이 이긴다.
 */
export const syncPushToken = (uid: string): Promise<void> => {
  if (!running) return runExclusive(() => syncPushTokenRaw(uid));
  if (queuedSync) {
    queuedSync.uid = uid;
    return queuedSync.promise;
  }
  queuedSync = { uid, ...deferred() };
  return queuedSync.promise;
};

/** 로그아웃 등으로 더는 필요 없는 uid의 대기 중 후행 실행을 버린다(이미 도는 실행은 끝까지 간다). */
export const cancelQueuedPushSync = (uid: string): void => {
  if (queuedSync?.uid !== uid) return;
  dropQueuedSync();
};

export const enablePushOnThisDevice = async (uid: string): Promise<PushPermission> => {
  const permission = toPushPermission(await requestPermission(getMessaging()));
  notifyPushPermissionChanged();
  if (permission === "granted") await syncPushToken(uid);
  return permission;
};

/**
 * 로그아웃 시: 이 기기가 다음 사용자에게 이전 계정의 알림을 받지 않게 한다. ID 토큰이 필요하므로
 * firebase signOut 전에 부른다. 끝나지 않은 단계는 해제 대기로 남아 다음 syncPushToken이 처리한다.
 *
 * - 권한을 보지 않는다: 설정에서 알림을 끈 뒤 로그아웃해도 토큰은 살아 있고, 다시 켜면 다음 계정이
 *   같은 토큰을 받는다.
 * - 저장소 실패와 무관하게 서버·기기 삭제를 모두 시도한다. 기기 토큰 무효화가 핵심 안전장치다.
 * - 첫 에러를 다시 던진다(호출부가 로그만 남긴다).
 * - 동기화와 같은 큐에서 돈다: 도는 동기화가 끝나길 기다리고, 대기 중인 후행 동기화는 버리며,
 *   끝날 때까지 뒤에 온 동기화를 막는다. 호출부가 시간 초과로 먼저 넘어가도 다음 계정의 동기화는
 *   이 해제가 끝난 뒤에 돈다.
 */
const disablePushRaw = async (uid: string): Promise<void> => {
  const messaging = getMessaging();
  let firstError: unknown = null;
  const record = (error: unknown) => {
    firstError ??= error;
  };
  const persist = async (p: ReleasePending) => {
    try {
      await saveReleasePending(p);
    } catch (error) {
      record(error);
    }
  };

  let token = "";
  try {
    token = await getToken(messaging);
  } catch (error) {
    // 토큰을 몰라 서버 삭제는 못 한다. 기기 삭제만 시도한다(빈 토큰 대기는 서버 삭제를 건너뛴다).
    record(error);
  }

  let pending: ReleasePending = { token, uid, serverDeleted: false, deviceDeleted: false };
  if (token) {
    // 네트워크 단계 전에 먼저 남겨 둔다 — 중간에 앱이 죽거나 시간 초과로 버려져도 다음 동기화가 마무리한다.
    await persist(pending);
    try {
      await unregisterPushToken(token);
      pending = { ...pending, serverDeleted: true };
    } catch (error) {
      record(error);
    }
  }

  // 서버 삭제 결과와 관계없이 기기 토큰은 무효화한다. 그러면 옛 DO가 다음 발송에서 UNREGISTERED를 받아 스스로 버린다.
  try {
    await deleteToken(messaging);
    pending = { ...pending, deviceDeleted: true };
  } catch (error) {
    record(error);
  }

  const done = pending.deviceDeleted && (pending.serverDeleted || !token);
  if (done) {
    if (token) {
      try {
        await clearReleasePending();
      } catch (error) {
        record(error);
      }
    }
  } else {
    await persist(pending);
  }
  if (firstError !== null) throw firstError;
};

export const disablePushOnThisDevice = (uid: string): Promise<void> => {
  dropQueuedSync();
  if (!running) return startDisable(uid);
  const queued: QueuedDisable = { uid, ...deferred() };
  queuedDisables.push(queued);
  return queued.promise;
};

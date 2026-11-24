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

/**
 * 해제를 시작한 uid. 해제가 끝나도 firebase signOut 전까지는 그 계정의 동기화(onTokenRefresh로 FCM이
 * 새로 발급한 토큰, 권한 이벤트)가 올 수 있다 — 그대로 등록하면 다음 계정이 같은 토큰을 받아 앞 계정의
 * 알림이 다음 계정에게 간다. 그래서 래치가 걸린 uid의 동기화는 등록하지 않고 끝낸다.
 *
 * 풀리는 때: 다른 uid의 동기화가 돌 때(다음 계정 로그인), 또는 로그인 상태가 사용자로 바뀌었을 때
 * usePushTokenSync가 resetPushReleaseLatch()를 부를 때(같은 사용자의 재로그인).
 */
let releasedUid: string | null = null;

/** 로그인 상태가 사용자로 바뀌었을 때 부른다(같은 사용자가 로그아웃 뒤 다시 로그인해도 등록되게). */
export const resetPushReleaseLatch = (): void => {
  releasedUid = null;
};

const syncPushTokenRaw = async (uid: string): Promise<void> => {
  if (releasedUid === uid) return;
  if (releasedUid !== null) releasedUid = null;
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
type QueuedRelease = Deferred & { start: () => Promise<void> };

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
const queuedReleases: QueuedRelease[] = [];

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
    const nextRelease = queuedReleases.shift();
    if (nextRelease) {
      nextRelease.start().then(nextRelease.resolve, nextRelease.reject);
      return;
    }
    const next = queuedSync;
    queuedSync = null;
    if (next) runExclusive(() => syncPushTokenRaw(next.uid)).then(next.resolve, next.reject);
  };
  run.then(after, after);
  return run;
};

const startRelease = (uid: string, op: () => Promise<void>): Promise<void> =>
  runExclusive(op, () => {
    if (queuedSync?.uid === uid) dropQueuedSync();
  });

/** 해제류(로그아웃 해제·탈퇴 기기 토큰 삭제)를 큐에 넣는다. 래치는 큐에 넣기 전에 건다. */
const enqueueRelease = (uid: string, op: () => Promise<void>): Promise<void> => {
  releasedUid = uid;
  dropQueuedSync();
  if (!running) return startRelease(uid, op);
  const queued: QueuedRelease = { start: () => startRelease(uid, op), ...deferred() };
  queuedReleases.push(queued);
  return queued.promise;
};

/**
 * 끝나지 않은 해제가 있으면 권한과 무관하게 먼저 처리하고(실패하면 던진다), 권한이 있을 때만
 * 현재 토큰을 Worker에 등록한다. upsert라 여러 번 불러도 된다.
 *
 * 해제와 같은 큐로 직렬화한다. 실행 중에 온 호출은 끝난 뒤 한 번만 더 도는 후행 실행 하나로 합치고,
 * 그 사이 호출한 쪽의 uid가 가장 마지막 것이 이긴다.
 */
export const syncPushToken = (uid: string): Promise<void> => {
  // 해제 중이거나 해제한 계정은 기다리지 않고 버린다(대기 중인 다음 계정의 후행 실행 uid도 덮지 않는다).
  if (releasedUid === uid) return Promise.resolve();
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
    // 토큰을 못 받아 이번에 아무것도 남기지 않았어도, 예전 해제 대기가 남아 있을 수 있다 — 해제가 끝났으니 지운다.
    try {
      await clearReleasePending();
    } catch (error) {
      record(error);
    }
  } else {
    await persist(pending);
  }
  if (firstError !== null) throw firstError;
};

export const disablePushOnThisDevice = (uid: string): Promise<void> => enqueueRelease(uid, () => disablePushRaw(uid));

/**
 * 탈퇴 시: Worker의 DELETE /account 전에 부른다. 래치를 걸고 같은 큐에서 기기 토큰만 지운다 —
 * 도는 동기화가 끝난 뒤에 지우고, 이후 이 uid의 동기화(onTokenRefresh 등)는 등록하지 않으므로
 * 삭제된 계정의 DO에 토큰이 다시 들어가지 않는다. 서버 쪽 토큰은 DELETE /account가 계정째 지운다.
 * 실패하면 던진다(호출부가 보고하고 탈퇴를 계속한다).
 */
export const releaseDeviceTokenForDeletedAccount = (uid: string): Promise<void> =>
  enqueueRelease(uid, async () => {
    await deleteToken(getMessaging());
  });

import { useEffect } from "react";
import { AppState } from "react-native";
import { getMessaging, onTokenRefresh } from "@react-native-firebase/messaging";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import {
  cancelQueuedPushSync,
  getPushPermission,
  notifyPushPermissionChanged,
  resetPushReleaseLatch,
  subscribePushPermissionChanged,
  syncPushToken,
  type PushPermission,
} from "../push/pushClient";

export const usePushTokenSync = (): void => {
  const { user } = useAuthState();
  const uid = user?.uid ?? null;

  // iOS 설정 앱에서 알림을 켜고 돌아오면 앱 안에서는 아무도 권한 변경을 알리지 않는다. 어느 화면이 열려
  // 있든 여기서 active 복귀 때 다시 읽어, 바뀌었으면 알린다 — 그러면 아래 동기화와 useForegroundReminders의
  // onMessage 구독, 알림 화면 상태가 함께 갱신된다. 앱 안에서 알린 변경은 기준값만 맞춘다(중복 알림 방지).
  useEffect(() => {
    let cancelled = false;
    let last: PushPermission | null = null;
    const read = (notifyOnChange: boolean) => {
      getPushPermission()
        .then((permission) => {
          if (cancelled) return;
          const changed = last !== null && permission !== last;
          last = permission;
          if (changed && notifyOnChange) notifyPushPermissionChanged();
        })
        .catch((error) => reportError(error, "reminder"));
    };
    read(false);
    const offPermission = subscribePushPermissionChanged(() => read(false));
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") read(true);
    });
    return () => {
      cancelled = true;
      offPermission();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    // 이 효과가 uid로 도는 때가 곧 로그인 관찰 시점이다(ReminderSync는 로그인 중에만 마운트되고, 로그아웃
    // 해제는 firebase signOut 전이라 그동안 uid가 바뀌지 않는다). 직전 로그아웃의 래치를 풀어 같은 사용자의
    // 재로그인도 등록되게 한다.
    resetPushReleaseLatch();
    // 직렬화·합치기는 pushClient가 한다. 여기서는 실패만 보고하고, 언마운트 뒤에는 새 실행을 시작하지 않는다.
    let active = true;
    const sync = () => {
      if (!active) return;
      syncPushToken(uid).catch((error) => reportError(error, "reminder"));
    };
    sync();
    const offToken = onTokenRefresh(getMessaging(), sync);
    const offPermission = subscribePushPermissionChanged(sync);
    return () => {
      active = false;
      cancelQueuedPushSync(uid);
      offToken();
      offPermission();
    };
  }, [uid]);
};

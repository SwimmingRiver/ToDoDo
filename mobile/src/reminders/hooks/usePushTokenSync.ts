import { useEffect } from "react";
import { getMessaging, onTokenRefresh } from "@react-native-firebase/messaging";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import {
  cancelQueuedPushSync,
  resetPushReleaseLatch,
  subscribePushPermissionChanged,
  syncPushToken,
} from "../push/pushClient";

export const usePushTokenSync = (): void => {
  const { user } = useAuthState();
  const uid = user?.uid ?? null;

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

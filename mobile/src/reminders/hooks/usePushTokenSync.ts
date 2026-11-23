import { useEffect } from "react";
import { getMessaging, onTokenRefresh } from "@react-native-firebase/messaging";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import { cancelQueuedPushSync, subscribePushPermissionChanged, syncPushToken } from "../push/pushClient";

export const usePushTokenSync = (): void => {
  const { user } = useAuthState();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
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

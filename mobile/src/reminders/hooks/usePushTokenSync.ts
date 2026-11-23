import { useEffect } from "react";
import { getMessaging, onTokenRefresh } from "@react-native-firebase/messaging";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import { subscribePushPermissionChanged, syncPushToken } from "../push/pushClient";

/**
 * 동기화를 직렬화한다. 실행 중이면 끝난 뒤 한 번만 더 돌도록 합치고(그 사이 권한·토큰이 바뀌었을 수 있다),
 * 동시에 두 번 겹치지 않는다. 실패는 모두 reportError로 남기고 던지지 않는다.
 */
const createSerializedSync = (uid: string) => {
  let running: Promise<void> | null = null;
  let rerun = false;
  const loop = async () => {
    do {
      rerun = false;
      try {
        await syncPushToken(uid);
      } catch (error) {
        reportError(error, "reminder");
      }
    } while (rerun);
    running = null;
  };
  return () => {
    if (running) {
      rerun = true;
      return;
    }
    running = loop();
  };
};

export const usePushTokenSync = (): void => {
  const { user } = useAuthState();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    const sync = createSerializedSync(uid);
    sync();
    const offToken = onTokenRefresh(getMessaging(), sync);
    const offPermission = subscribePushPermissionChanged(sync);
    return () => {
      offToken();
      offPermission();
    };
  }, [uid]);
};

import { useEffect } from "react";
import * as Sentry from "@sentry/react";

/** 앱 진입 시 1회: 권한이 있으면 현재 FCM 토큰을 다시 등록한다(토큰 교체·DO의 무효 토큰 삭제 복구). */
export const usePushTokenSync = (): void => {
  useEffect(() => {
    import("../push/pushClient")
      .then(({ syncPushToken }) => syncPushToken())
      .catch((error) => {
        console.error("푸시 토큰 동기화 실패:", error);
        Sentry.captureException(error);
      });
  }, []);
};

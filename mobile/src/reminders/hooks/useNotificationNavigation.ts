import { useEffect } from "react";
import {
  getInitialNotification,
  getMessaging,
  onNotificationOpenedApp,
  type RemoteMessage,
} from "@react-native-firebase/messaging";
import { openTodoDetail } from "../../navigation/navigationRef";
import { reportError } from "../../shared/lib/sentry";

const handle = (message: RemoteMessage | null): void => {
  const todoId = message?.data?.todoId;
  if (typeof todoId === "string" && todoId) openTodoDetail(todoId);
};

/**
 * 알림을 눌러 앱이 열렸을 때 해당 할 일 상세로 이동한다. 백그라운드는 onNotificationOpenedApp,
 * 종료 상태는 getInitialNotification이 알려 준다(네비게이션 준비 전이면 navigationRef가 보류한다).
 */
export const useNotificationNavigation = (): void => {
  useEffect(() => {
    let cancelled = false;
    const messaging = getMessaging();
    const off = onNotificationOpenedApp(messaging, handle);
    getInitialNotification(messaging)
      .then((message) => {
        if (!cancelled) handle(message);
      })
      .catch((error) => reportError(error, "reminder"));
    return () => {
      cancelled = true;
      off();
    };
  }, []);
};

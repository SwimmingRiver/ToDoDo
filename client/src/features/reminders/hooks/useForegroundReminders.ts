import { useEffect, useState } from "react";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared/ui/toast/useToast";
import { subscribeForegroundMessages } from "../push/pushClient";
import { getPushPermission, onPushPermissionChanged } from "../push/pushSupport";

export const useForegroundReminders = (): void => {
  const toast = useToast();
  // 마운트 시점엔 권한이 없어 구독이 no-op이었더라도, 세션 중 "켜기"로 granted가
  // 되면 다시 구독해야 한다. 열린 탭이 있으면 SW는 알림 대신 페이지로 메시지를
  // 넘기므로, 구독이 없으면 그 알림은 조용히 사라진다.
  const [permission, setPermission] = useState(getPushPermission);

  useEffect(() => onPushPermissionChanged(() => setPermission(getPushPermission())), []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    subscribeForegroundMessages(({ title, body }) => toast.info(title, body))
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // toast 객체 정체성에 따라 재구독하지 않는다(권한이 바뀔 때만 재구독).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);
};

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMessaging, onMessage } from "@react-native-firebase/messaging";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import { useReminderBanner } from "../components/ReminderBanner";
import { getPushPermission, subscribePushPermissionChanged, type PushPermission } from "../push/pushClient";
import { REMINDER_HISTORY_KEY } from "./useReminderHistory";

/** 서버는 모든 기기로 보낸 뒤에 기록을 남긴다. 바로 재조회하면 아직 없을 수 있어 잠시 기다린다(웹과 동일). */
export const HISTORY_REFETCH_DELAY_MS = 3000;

export const useForegroundReminders = (): void => {
  const banner = useReminderBanner();
  const queryClient = useQueryClient();
  const { user } = useAuthState();
  const uid = user?.uid ?? null;
  const [permission, setPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getPushPermission()
        .then((p) => {
          if (!cancelled) setPermission(p);
        })
        .catch((error) => reportError(error, "reminder"));
    };
    refresh();
    const off = subscribePushPermissionChanged(refresh);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = onMessage(getMessaging(), async (message) => {
      const title = message.notification?.title;
      const body = message.notification?.body;
      if (title || body) banner.show(title ?? "", body ?? "");
      const timer = setTimeout(() => {
        timers.delete(timer);
        void queryClient.invalidateQueries({ queryKey: [REMINDER_HISTORY_KEY, uid] });
      }, HISTORY_REFETCH_DELAY_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
    // banner·queryClient 정체성 변화로 재구독하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, uid]);
};

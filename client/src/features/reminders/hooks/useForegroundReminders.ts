import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared/ui/toast/useToast";
import { subscribeForegroundMessages } from "../push/pushClient";
import { getPushPermission, onPushPermissionChanged } from "../push/pushSupport";
import { REMINDER_HISTORY_KEY } from "./useReminderHistory";

/**
 * 서버는 모든 기기로 보낸 "뒤에" 기록을 남긴다. 첫 기기가 메시지를 받자마자 재조회하면
 * 아직 기록이 없을 수 있어 잠시 기다린다(벨을 열면 어차피 다시 조회한다).
 */
export const HISTORY_REFETCH_DELAY_MS = 3_000;

export const useForegroundReminders = (): void => {
  const toast = useToast();
  const queryClient = useQueryClient();
  // 마운트 시점엔 권한이 없어 구독이 no-op이었더라도, 세션 중 "켜기"로 granted가
  // 되면 다시 구독해야 한다. 열린 탭이 있으면 SW는 알림 대신 페이지로 메시지를
  // 넘기므로, 구독이 없으면 그 알림은 조용히 사라진다.
  const [permission, setPermission] = useState(getPushPermission);

  useEffect(() => onPushPermissionChanged(() => setPermission(getPushPermission())), []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    subscribeForegroundMessages(({ title, body }) => {
      toast.info(title, body);
      const timer = setTimeout(() => {
        timers.delete(timer);
        void queryClient.invalidateQueries({ queryKey: [REMINDER_HISTORY_KEY] });
      }, HISTORY_REFETCH_DELAY_MS);
      timers.add(timer);
    })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
      unsubscribe?.();
      timers.forEach(clearTimeout);
    };
    // toast·queryClient 객체 정체성에 따라 재구독하지 않는다(권한이 바뀔 때만 재구독).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);
};

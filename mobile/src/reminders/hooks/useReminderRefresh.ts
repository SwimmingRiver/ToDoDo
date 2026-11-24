import { useEffect, useMemo, useRef } from "react";
import { buildReminderFingerprint } from "@tododo/core/dist/reminders/index.js";
import { useTodos } from "../../hooks/useTodos";
import { reportError } from "../../shared/lib/sentry";
import { requestReminderRefresh } from "../api/reminderProxyApi";

export const REFRESH_DEBOUNCE_MS = 2000;

/**
 * todos 캐시 변화를 관찰해 알림 예약 갱신 신호를 보낸다(웹과 동일). 이 기기의 알림 권한과 무관하다 —
 * 다른 기기에서 알림을 켰을 수 있다.
 */
export const useReminderRefresh = (): void => {
  const { data: todos } = useTodos();
  const lastSentRef = useRef<string | null>(null);
  const fingerprint = useMemo(() => (todos ? buildReminderFingerprint(todos) : null), [todos]);

  useEffect(() => {
    if (fingerprint === null || fingerprint === lastSentRef.current) return;
    const timer = setTimeout(() => {
      requestReminderRefresh()
        .then(() => {
          lastSentRef.current = fingerprint;
        })
        .catch((error) => reportError(error, "reminder"));
    }, REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [fingerprint]);
};

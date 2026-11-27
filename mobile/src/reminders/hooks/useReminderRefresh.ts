import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { buildReminderFingerprint } from "@tododo/core/dist/reminders/index.js";
import { useTodos } from "../../hooks/useTodos";
import { reportError } from "../../shared/lib/sentry";
import { requestReminderRefresh } from "../api/reminderProxyApi";

export const REFRESH_DEBOUNCE_MS = 2000;

/**
 * todos 캐시 변화를 관찰해 알림 예약 갱신 신호를 보낸다(웹과 동일). 이 기기의 알림 권한과 무관하다 —
 * 다른 기기에서 알림을 켰을 수 있다.
 *
 * 연속 수정은 2초 디바운스로 묶되, 앱이 background/inactive로 가면 대기 중인 신호를 즉시 보낸다.
 * 디바운스만 있으면 알림을 설정하고 2초 안에 앱을 닫을 때 신호가 사라져 푸시가 오지 않았다.
 * (inactive는 앱 전환기로 스와이프해 종료하는 경로에서 background보다 먼저 온다.)
 * 언마운트(로그아웃)에서는 보내지 않는다 — 이미 인증이 끊긴 뒤라 실패할 요청이다.
 */
export const useReminderRefresh = (): void => {
  const { data: todos } = useTodos();
  const lastSentRef = useRef<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fingerprint = useMemo(() => (todos ? buildReminderFingerprint(todos) : null), [todos]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // 대기 중인 신호를 지금 보낸다. 타이머를 먼저 지워 같은 내용이 두 번 나가지 않게 한다.
  // ref만 읽으므로 렌더마다 새로 만들 필요가 없다.
  const flush = useCallback(() => {
    const target = pendingRef.current;
    clearTimer();
    pendingRef.current = null;
    if (target === null || target === lastSentRef.current || target === inFlightRef.current) return;
    inFlightRef.current = target;
    requestReminderRefresh()
      .then(() => {
        lastSentRef.current = target;
      })
      .catch((error) => reportError(error, "reminder"))
      .finally(() => {
        if (inFlightRef.current === target) inFlightRef.current = null;
      });
  }, [clearTimer]);

  useEffect(() => {
    if (fingerprint === null || fingerprint === lastSentRef.current) {
      clearTimer();
      pendingRef.current = null;
      return;
    }
    pendingRef.current = fingerprint;
    clearTimer();
    timerRef.current = setTimeout(flush, REFRESH_DEBOUNCE_MS);
  }, [fingerprint, clearTimer, flush]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") flush();
    });
    return () => {
      sub.remove();
      clearTimer();
      pendingRef.current = null;
    };
  }, [clearTimer, flush]);
};

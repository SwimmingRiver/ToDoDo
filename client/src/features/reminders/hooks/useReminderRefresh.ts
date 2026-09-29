import { useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/react";
// 배럴(@/features/todo)은 TodoList 등 컴포넌트까지 끌어온다. App 경로라 훅만 직접 가져온다.
import { useGetTodos } from "@/features/todo/hooks";
import type { Todo } from "@/features/todo/types";
import { requestReminderRefresh } from "../api/reminderProxyApi";

export const REFRESH_DEBOUNCE_MS = 2000;

/** 알림 예약에 영향을 주는 값만 담은 지문. 제목 변경 같은 무관한 수정은 신호를 보내지 않는다. */
export const buildReminderFingerprint = (todos: Todo[]): string =>
  todos
    .filter((t) => !!t.dueAt)
    .map((t) => [t.id, t.dueAt, t.status, t.archived ? 1 : 0, t.reminderOffsetMinutes ?? "default"].join("|"))
    .sort()
    .join(";");

/**
 * 캘린더 동기화(useSyncTodosToCalendar)와 같은 방식: 저장 경로마다 호출하지 않고
 * todos 캐시 변화를 관찰한다. 이 기기의 알림 권한과 무관하게 보낸다 — 다른 기기에서
 * 알림을 켰을 수 있고, 토큰이 없는 사용자의 신호는 DO가 조회 없이 끝낸다.
 */
export const useReminderRefresh = (): void => {
  const { data: todos } = useGetTodos();
  const lastSentRef = useRef<string | null>(null);
  const fingerprint = useMemo(() => (todos ? buildReminderFingerprint(todos) : null), [todos]);

  useEffect(() => {
    if (fingerprint === null || fingerprint === lastSentRef.current) return;
    const timer = setTimeout(() => {
      requestReminderRefresh()
        .then(() => {
          lastSentRef.current = fingerprint;
        })
        .catch((error) => {
          console.error("알림 예약 갱신 신호 실패:", error);
          Sentry.captureException(error);
        });
    }, REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [fingerprint, todos]);
};

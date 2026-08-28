import { useCallback, useMemo } from "react";
import type { Todo } from "@tododo/core";
import { useTodos } from "./useTodos";
import { useUpdateTodo } from "./useUpdateTodo";
import { isDateInTodoRange } from "../shared/utils/dateRange";
import { buildCalendarMarkedDates, type CalendarMarkedDates } from "../shared/utils/calendarMarkers";

export interface UseCalendarTodosResult {
  markedDates: CalendarMarkedDates;
  isLoading: boolean;
  isError: boolean;
  getTodosForDate: (dateKey: string) => Todo[];
  toggleDone: (todo: Todo) => void;
}

/**
 * 캘린더 화면의 데이터 소스. 신규 쿼리 훅 없이 기존 useTodos()(TanStack Query,
 * 폴링) 결과를 그대로 마커/날짜별 목록으로 가공한다(스펙 5절 "Firestore 실시간
 * 리스너 도입 안 함"과 동일 정책).
 */
export const useCalendarTodos = (): UseCalendarTodosResult => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutate: updateTodo } = useUpdateTodo();

  const markedDates = useMemo(() => buildCalendarMarkedDates(todos ?? []), [todos]);

  const getTodosForDate = useCallback(
    (dateKey: string) => (todos ?? []).filter((todo) => isDateInTodoRange(dateKey, todo)),
    [todos],
  );

  // useTodayTodos.ts의 toggleDone과 동일 로직(웹 toggleDone과 동일 정책) — 화면마다
  // 독립된 훅에 두는 기존 컨벤션(client/CLAUDE.md "커스텀 훅")을 따라 그대로 반복한다.
  const toggleDone = useCallback(
    (todo: Todo) => {
      const isDone = todo.status === "done";
      updateTodo({
        id: todo.id,
        fields: { status: isDone ? "todo" : "done", doneAt: isDone ? null : new Date().toISOString() },
        title: todo.title,
      });
    },
    [updateTodo],
  );

  return { markedDates, isLoading, isError, getTodosForDate, toggleDone };
};

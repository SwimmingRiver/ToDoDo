import { useCallback, useMemo } from "react";
import type { Todo } from "@tododo/core";
import { useTodos } from "./useTodos";
import { isDateInTodoRange } from "../shared/utils/dateRange";
import { buildCalendarMarkedDates, type CalendarMarkedDates } from "../shared/utils/calendarMarkers";

export interface UseCalendarTodosResult {
  markedDates: CalendarMarkedDates;
  isLoading: boolean;
  isError: boolean;
  getTodosForDate: (dateKey: string) => Todo[];
}

/**
 * 캘린더 화면의 데이터 소스. 신규 쿼리 훅 없이 기존 useTodos()(TanStack Query,
 * 폴링) 결과를 그대로 마커/날짜별 목록으로 가공한다(스펙 5절 "Firestore 실시간
 * 리스너 도입 안 함"과 동일 정책).
 */
export const useCalendarTodos = (): UseCalendarTodosResult => {
  const { data: todos, isLoading, isError } = useTodos();

  const markedDates = useMemo(() => buildCalendarMarkedDates(todos ?? []), [todos]);

  const getTodosForDate = useCallback(
    (dateKey: string) => (todos ?? []).filter((todo) => isDateInTodoRange(dateKey, todo)),
    [todos],
  );

  return { markedDates, isLoading, isError, getTodosForDate };
};

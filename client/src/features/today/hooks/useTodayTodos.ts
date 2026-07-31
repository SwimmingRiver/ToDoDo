import { useCallback, useMemo } from "react";
import { useTodo } from "@/features/todo/hooks";
import type { Todo } from "@/features/todo/types";
import { getDaysLeft } from "@/shared/utils/due";
import { getStripDates, toDateKey, toDateKeyFromISO } from "@/shared/utils/date";
import { isDateInTodoRange } from "@/shared/utils/dateRange";

export type DayMarker = "none" | "normal" | "danger";

export interface UseTodayTodosResult {
  inProgressTodos: Todo[];
  doneTodos: Todo[];
  doneCount: number;
  totalCount: number;
  markers: Record<string, DayMarker>;
  isLoading: boolean;
  isError: boolean;
  toggleDone: (todo: Todo) => void;
}

/**
 * 선택된 날짜가 startAt~dueAt 구간에 포함되는 todo(캘린더와 동일한 range 포함
 * 판정, `isDateInTodoRange` 참고)를 진행중/완료로 분리하고, 주간 스트립용 마커와
 * 완료율을 계산한다.
 */
export const useTodayTodos = (selectedDate: string, windowStart: string): UseTodayTodosResult => {
  const { useGetTodos, useUpdateTodo } = useTodo();
  const { data: todos, isLoading, isError } = useGetTodos;
  const { mutate: updateTodo } = useUpdateTodo;

  const todosForSelectedDate = useMemo(() => {
    if (!todos) return [];
    // 기간(startAt~dueAt) 항목은 캘린더 화면과 동일한 정책으로 시작일~마감일 매일
    // 노출한다(dueAt 단독 비교였던 기존 필터를 range 포함 판정으로 교체).
    return todos.filter((todo) => isDateInTodoRange(selectedDate, todo));
  }, [todos, selectedDate]);

  const inProgressTodos = useMemo(
    () => todosForSelectedDate.filter((todo) => todo.status !== "done"),
    [todosForSelectedDate],
  );

  const doneTodos = useMemo(
    () =>
      todosForSelectedDate
        .filter((todo) => todo.status === "done")
        .sort((a, b) => {
          const aTime = a.doneAt ? new Date(a.doneAt).getTime() : 0;
          const bTime = b.doneAt ? new Date(b.doneAt).getTime() : 0;
          return bTime - aTime;
        }),
    [todosForSelectedDate],
  );

  // 주간 스트립 마커는 의도적으로 dueAt 단독 기준을 유지한다(리스트 필터와 달리
  // range 포함으로 확장하지 않음). "마감 임박(빨간 점)"이라는 마커의 의미가 여전히
  // dueAt 기준 위험도 신호이고, 기간 항목을 진행 중인 모든 날짜에 점을 찍으면
  // "이 날 마감"과 "이 날 진행 중"이 시각적으로 구분되지 않아 주간 스트립 자체의
  // 정보 가치가 흐려진다. 이 확장 여부는 별도 논의로 미뤄졌다(spec.md 참고) —
  // 필터와 마커의 기준이 달라졌다는 사실 자체는 위 docstring/isDateInTodoRange로
  // 명시해 둔다.
  const markers = useMemo(() => {
    const stripDateKeys = getStripDates(windowStart).map(toDateKey);
    const result: Record<string, DayMarker> = {};

    for (const dateKey of stripDateKeys) {
      const todosOnDate = (todos ?? []).filter(
        (todo) => todo.dueAt && toDateKeyFromISO(todo.dueAt) === dateKey,
      );

      if (todosOnDate.length === 0) {
        result[dateKey] = "none";
        continue;
      }

      const hasDanger = todosOnDate.some(
        (todo) => todo.status !== "done" && getDaysLeft(todo.dueAt as string) <= 0,
      );
      result[dateKey] = hasDanger ? "danger" : "normal";
    }

    return result;
  }, [todos, windowStart]);

  const toggleDone = useCallback(
    (todo: Todo) => {
      const isDone = todo.status === "done";
      updateTodo({
        ...todo,
        status: isDone ? "todo" : "done",
        doneAt: isDone ? null : new Date().toISOString(),
      });
    },
    [updateTodo],
  );

  return {
    inProgressTodos,
    doneTodos,
    doneCount: doneTodos.length,
    totalCount: todosForSelectedDate.length,
    markers,
    isLoading,
    isError,
    toggleDone,
  };
};

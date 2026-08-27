import { useCallback, useMemo } from "react";
import type { Todo } from "@tododo/core";
import { useTodos } from "./useTodos";
import { useUpdateTodo } from "./useUpdateTodo";
import { getDaysLeft } from "../shared/utils/due";
import { getStripDates, isDateInTodoRange, toDateKey, toDateKeyFromISO, type DayMarker } from "../shared/utils/dateRange";

export type { DayMarker };

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
 * 선택된 날짜가 startAt~dueAt 구간에 포함되는 todo(isDateInTodoRange)를
 * 진행중/완료로 분리하고, 주간 스트립용 마커와 완료율을 계산한다.
 * 웹 client/src/features/today/hooks/useTodayTodos.ts와 동일 정책.
 */
export const useTodayTodos = (selectedDate: string, windowStart: string): UseTodayTodosResult => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutate: updateTodo } = useUpdateTodo();

  const todosForSelectedDate = useMemo(() => {
    if (!todos) return [];
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

  // 마커는 의도적으로 dueAt 단독 기준을 유지한다(range 포함으로 확장 안 함) —
  // "마감 임박(빨간 점)"은 여전히 dueAt 기준 위험도 신호다(스펙 결정 사항).
  const markers = useMemo(() => {
    const stripDateKeys = getStripDates(windowStart).map(toDateKey);
    const result: Record<string, DayMarker> = {};

    for (const dateKey of stripDateKeys) {
      const todosOnDate = (todos ?? []).filter((todo) => {
        if (!todo.dueAt) return false;
        return toDateKeyFromISO(todo.dueAt) === dateKey;
      });

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

  // useUpdateTodo의 mutate 시그니처는 { id, fields, title } 형태다(웹의 "Todo 전체를
  // 넘기는" 시그니처와 다르다 — mobile/src/hooks/useUpdateTodo.ts 확인됨).
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

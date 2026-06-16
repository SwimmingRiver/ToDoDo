import { useCallback, useMemo } from "react";
import { useTodo } from "@/features/todo/hooks";
import type { Todo } from "@/features/todo/types";
import { getDaysLeft } from "@/shared/utils/due";
import { getWeekDates, toDateKey, toDateKeyFromISO } from "@/shared/utils/date";

export type DayMarker = "none" | "normal" | "danger";

/** selectedDate가 속한 주(일~토)의 7개 날짜 키를 반환한다. */
const getWeekDateKeys = (selectedDate: string): string[] =>
  getWeekDates(selectedDate).map(toDateKey);

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
 * 선택된 날짜(dueAt 기준)에 해당하는 todo를 진행중/완료로 분리하고,
 * 주간 스트립용 마커와 완료율을 계산한다.
 */
export const useTodayTodos = (selectedDate: string): UseTodayTodosResult => {
  const { useGetTodos, useUpdateTodo } = useTodo();
  const { data: todos, isLoading, isError } = useGetTodos;
  const { mutate: updateTodo } = useUpdateTodo;

  const todosForSelectedDate = useMemo(() => {
    if (!todos) return [];
    return todos.filter(
      (todo) => todo.dueAt && toDateKeyFromISO(todo.dueAt) === selectedDate,
    );
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

  const markers = useMemo(() => {
    const weekDateKeys = getWeekDateKeys(selectedDate);
    const result: Record<string, DayMarker> = {};

    for (const dateKey of weekDateKeys) {
      const todosOnDate = (todos ?? []).filter(
        (todo) => todo.dueAt && toDateKeyFromISO(todo.dueAt) === dateKey,
      );

      if (todosOnDate.length === 0) {
        result[dateKey] = "none";
        continue;
      }

      const hasDanger = todosOnDate.some(
        (todo) => getDaysLeft(todo.dueAt as string) <= 0,
      );
      result[dateKey] = hasDanger ? "danger" : "normal";
    }

    return result;
  }, [todos, selectedDate]);

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

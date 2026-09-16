import type { Todo } from "@/features/todo";
import { toDateKey, toDateKeyFromISO } from "@/shared/utils/date";

interface TrendPoint {
  /** 로컬 타임존 기준 "yyyy-MM-dd". */
  date: string;
  count: number;
}

/** now를 마지막 날로 포함해 최근 `days`일간 일별 완료 개수 추이를 반환한다. */
export const computeCompletionTrend = (
  todos: Todo[],
  days: number,
  now: Date = new Date(),
): TrendPoint[] => {
  const countByDate = new Map<string, number>();
  todos.forEach((todo) => {
    if (todo.status !== "done" || !todo.doneAt) return;
    const key = toDateKeyFromISO(todo.doneAt);
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  });

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toDateKey(d);
    return { date: key, count: countByDate.get(key) ?? 0 };
  });
};

export type { TrendPoint };

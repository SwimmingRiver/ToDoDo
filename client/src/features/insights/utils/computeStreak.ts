import type { Todo } from "@/features/todo";
import { toDateKey, toDateKeyFromISO } from "@/shared/utils/date";

/**
 * 오늘부터 거꾸로 센 연속 완료일 수(스트릭). 오늘 아직 완료한 게 없어도
 * 어제까지 이어진 스트릭은 0으로 끊지 않는다 — 오늘 하루가 아직 끝나지
 * 않았을 뿐일 수 있어서다. 대신 어제도 완료가 없으면 그 시점에서 스트릭은
 * 0이다.
 */
export const computeStreak = (todos: Todo[], now: Date = new Date()): number => {
  const doneDateKeys = new Set(
    todos
      .filter((todo) => todo.status === "done" && !!todo.doneAt)
      .map((todo) => toDateKeyFromISO(todo.doneAt as string)),
  );

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!doneDateKeys.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (doneDateKeys.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

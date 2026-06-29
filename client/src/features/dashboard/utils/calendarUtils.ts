import { getDaysLeft } from "@/shared/utils/due";
import type { Todo } from "@/features/todo/types/todo.type";

/**
 * todo가 기한 초과인지 판단합니다.
 * dueAt이 오늘 이전이고 status가 'done'이 아닌 경우 true를 반환합니다.
 */
export function isOverdue(todo: Todo): boolean {
  if (!todo.dueAt) return false;
  if (todo.status === "done") return false;
  return getDaysLeft(todo.dueAt) < 0;
}

import type { Todo } from "@/features/todo";

/**
 * kanban 보드에 노출할지 여부를 판단하는 반복 인스턴스 전용 필터.
 *
 * 정책(스펙 4-5절): 반복 인스턴스는 dueAt <= 오늘 인 것만 kanban에 노출하고,
 * 미래 인스턴스는 캘린더 전용으로 남긴다. 일반(비반복) 할 일은 이 필터의 영향을
 * 받지 않고 항상 true를 반환한다 — 기존 kanban 노출 로직(status 기준 컬럼 분류)에
 * 얹어 추가로 적용하는 필터이며, 기존 필터를 대체하지 않는다.
 */
export const isVisibleInKanban = (todo: Todo, today: Date): boolean => {
  if (!todo.recurrence) return true;
  if (!todo.dueAt) return true; // 반복인데 dueAt이 없는 비정상 상태는 방어적으로 노출 유지

  const due = new Date(todo.dueAt);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  return due.getTime() <= endOfToday.getTime();
};

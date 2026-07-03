import type { Todo } from "../types";

/**
 * 같은 recurrenceId를 가진 반복 인스턴스 중 dueAt이 가장 이른 것(지난 미완료(overdue)가
 * 있으면 그것, 없으면 다음 예정 건) 하나만 남기고 나머지는 목록에서 숨긴다. 반복 아닌
 * 할 일(recurrenceId === null)은 그대로 통과시킨다. 다른 문서를 지우는 게 아니라 이
 * 목록에 렌더링할 대표만 고르는 순수 함수다 — 실제 삭제는 useDeleteRecurringSeries가 담당.
 */
export function collapseRecurringInstances(todos: Todo[]): Todo[] {
  const representativeByRecurrenceId = new Map<string, Todo>();
  const result: Todo[] = [];

  for (const todo of todos) {
    if (!todo.recurrenceId) {
      result.push(todo);
      continue;
    }

    const existing = representativeByRecurrenceId.get(todo.recurrenceId);
    if (!existing) {
      representativeByRecurrenceId.set(todo.recurrenceId, todo);
      result.push(todo);
      continue;
    }

    const existingDue = existing.dueAt ? new Date(existing.dueAt).getTime() : Infinity;
    const currentDue = todo.dueAt ? new Date(todo.dueAt).getTime() : Infinity;
    if (currentDue < existingDue) {
      const index = result.indexOf(existing);
      result[index] = todo;
      representativeByRecurrenceId.set(todo.recurrenceId, todo);
    }
  }

  return result;
}

export interface ProjectCardData {
  todo: Todo;
  childTodos: Todo[];
  progress: number;
  subtaskInfo: { total: number; statusText: string };
  overdueInfo: { isOverdue: boolean; daysOver: number };
  isExpanded: boolean;
}

// 서브태스크 중 done 비율 (0~100). 서브태스크가 없으면 0 반환
export function getProjectProgress(
  allTodos: Todo[],
  projectId: string
): number {
  const subtasks = allTodos.filter((t) => t.parentId === projectId);
  if (subtasks.length === 0) return 0;
  const doneCount = subtasks.filter((t) => t.status === "done").length;
  return Math.round((doneCount / subtasks.length) * 100);
}

// "N개 할일 · 진행 중" 형태 정보 반환
// statusText: 모두 done → "완료", done이 하나도 없으면 "시작 전", 그 외 "진행 중"
export function getProjectSubtaskInfo(
  allTodos: Todo[],
  projectId: string
): { total: number; statusText: string } {
  const subtasks = allTodos.filter((t) => t.parentId === projectId);
  const total = subtasks.length;

  if (total === 0) {
    return { total, statusText: "시작 전" };
  }

  const doneCount = subtasks.filter((t) => t.status === "done").length;

  let statusText: string;
  if (doneCount === total) {
    statusText = "완료";
  } else if (doneCount === 0) {
    statusText = "시작 전";
  } else {
    statusText = "진행 중";
  }

  return { total, statusText };
}

// 서브태스크 중 dueAt이 오늘보다 이전인 것 감지
// 가장 오래된 초과 서브태스크 기준으로 daysOver 계산
export function getProjectOverdue(
  allTodos: Todo[],
  projectId: string
): { isOverdue: boolean; daysOver: number } {
  const subtasks = allTodos.filter((t) => t.parentId === projectId);

  if (subtasks.length === 0) {
    return { isOverdue: false, daysOver: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueSubtasks = subtasks.filter((t) => {
    if (!t.dueAt || t.status === "done") return false;
    const dueDate = new Date(t.dueAt);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });

  if (overdueSubtasks.length === 0) {
    return { isOverdue: false, daysOver: 0 };
  }

  // 가장 오래된 초과 서브태스크 기준
  const oldestDue = overdueSubtasks.reduce((oldest, t) => {
    const tDate = new Date(t.dueAt!);
    const oldestDate = new Date(oldest.dueAt!);
    return tDate < oldestDate ? t : oldest;
  });

  const oldestDueDate = new Date(oldestDue.dueAt!);
  oldestDueDate.setHours(0, 0, 0, 0);
  const daysOver = Math.floor(
    (today.getTime() - oldestDueDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return { isOverdue: true, daysOver };
}

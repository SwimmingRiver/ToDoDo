import type { Todo } from "../types";

/**
 * 같은 recurrenceId를 가진 반복 인스턴스 중 dueAt이 가장 이른 것(지난 미완료(overdue)가
 * 있으면 그것, 없으면 다음 예정 건) 하나만 남기고 나머지는 목록에서 숨긴다. 반복 아닌
 * 할 일(recurrenceId === null)은 그대로 통과시킨다. 다른 문서를 지우는 게 아니라 이
 * 목록에 렌더링할 대표만 고르는 순수 함수다 — 실제 삭제는 useDeleteRecurringSeries가 담당.
 *
 * overdueArchived: true인 인스턴스(sweepOverdueRecurringTodos가 dueAt이 지나 archived
 * 처리한 지난 미완료 회차)는 대표 후보에서 완전히 제외한다. 그러지 않으면 방치된 overdue
 * 인스턴스가 영구히 "대표"로 노출되는 문제(이번 정책의 발단)가 그대로 재현된다 — archived된
 * 회차를 건너뛰면 남은 인스턴스 중 다음으로 이른 것(미래 예정 건 포함)이 자연스럽게 새
 * 대표가 된다. 이 필드는 캘린더(dashboard)에는 영향을 주지 않는다 — 캘린더는
 * collapseRecurringInstances를 거치지 않고 getTodos() 원본을 그대로 렌더링한다.
 */
export function collapseRecurringInstances(todos: Todo[]): Todo[] {
  const representativeByRecurrenceId = new Map<string, Todo>();

  for (const todo of todos) {
    if (!todo.recurrenceId) continue;
    if (todo.overdueArchived) continue;

    const existing = representativeByRecurrenceId.get(todo.recurrenceId);
    if (!existing) {
      representativeByRecurrenceId.set(todo.recurrenceId, todo);
      continue;
    }

    const existingDue = existing.dueAt ? new Date(existing.dueAt).getTime() : Infinity;
    const currentDue = todo.dueAt ? new Date(todo.dueAt).getTime() : Infinity;
    if (currentDue < existingDue) {
      representativeByRecurrenceId.set(todo.recurrenceId, todo);
    }
  }

  // 대표를 처음 만난 인스턴스의 자리에 끼워넣지 않고, 대표 인스턴스 자신이 원래
  // todos 배열에서 차지하는 위치(=order 순위)에 그대로 남긴다. 그러지 않으면(과거
  // result[index] = todo로 첫 인스턴스 자리를 덮어쓰던 방식) 화면에 보이는 카드의
  // 위치가 실제 order 값과 어긋나, 칸반 드래그 재정렬(useKanbanDrag)이 이 카드의
  // over.id를 실제 order(대표의 order)로 찾는데 화면상 위치는 첫 인스턴스의 order
  // 근처로 보여 사용자가 드롭한 자리와 전혀 다른 위치로 카드가 이동하는 버그가 있었다.
  //
  // overdueArchived된 인스턴스는 위 루프에서 대표 후보로 고려되지 않았으므로
  // representativeByRecurrenceId에 값으로 들어있을 수 없다 — 그래서 아래 조건만으로도
  // 자동으로 걸러지지만, 의도를 명시적으로 드러내기 위해 한 번 더 확인한다.
  return todos.filter(
    (todo) =>
      !todo.recurrenceId ||
      (!todo.overdueArchived && representativeByRecurrenceId.get(todo.recurrenceId) === todo),
  );
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

// 루트 투두 자신 또는 서브태스크 중 dueAt이 오늘보다 이전인 것 감지
// 가장 오래된 초과 건(루트 자신 포함) 기준으로 daysOver 계산
export function getProjectOverdue(
  allTodos: Todo[],
  project: Todo
): { isOverdue: boolean; daysOver: number } {
  const subtasks = allTodos.filter((t) => t.parentId === project.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdueCandidate = (t: Todo) => {
    if (!t.dueAt || t.status === "done") return false;
    const dueDate = new Date(t.dueAt);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  // 루트 투두 자신도 후보에 포함시켜, 하위 투두가 없거나 아직 지나지 않았더라도
  // 루트 자신의 dueAt이 지났으면 초과로 판정되도록 한다.
  const overdueCandidates = [project, ...subtasks].filter(isOverdueCandidate);

  if (overdueCandidates.length === 0) {
    return { isOverdue: false, daysOver: 0 };
  }

  // 가장 오래된 초과 건 기준
  const oldestDue = overdueCandidates.reduce((oldest, t) => {
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

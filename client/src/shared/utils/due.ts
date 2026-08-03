export const DUE_SOON_DAYS = 3;

/** overdue 판정에 필요한 최소 필드만 요구한다(Todo 전체에 의존하지 않음). */
export interface TodoOverdueLike {
  dueAt: string | null;
  status: string;
}

/**
 * todo 하나가 기한 초과(overdue)인지 판정하는 최소 단위 로직.
 * dueAt이 없거나 status가 "done"이면 false, 그 외에는 getDaysLeft(로컬 자정 기준)가
 * 음수인지로 판단한다. 프로젝트(루트+서브태스크) 롤업이나 캘린더 표시 등 이 판정을
 * 소비하는 로직은 각 호출부(projectUtils.getProjectOverdue, calendarUtils.isOverdue)에
 * 그대로 남기고, 여기서는 오직 "이 한 건이 초과냐 아니냐"만 책임진다.
 */
export function isTodoOverdue(todo: TodoOverdueLike): boolean {
  if (!todo.dueAt || todo.status === "done") return false;
  return getDaysLeft(todo.dueAt) < 0;
}

export function getDaysLeft(dueAt: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDueBadgeLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}일 초과`;
  if (daysLeft === 0) return "D-day";
  return `D-${daysLeft}`;
}

export type Urgency = "normal" | "soon" | "danger";

/**
 * daysLeft(`getDaysLeft` 결과)를 3단계 긴급도로 분류한다.
 * D-day(0)는 지남(overdue)과 함께 "danger"로 묶는다 — 마감 당일도 지금 처리해야
 * 하는 상태라는 점은 지난 것과 동일하다는 today 화면 스펙 기준(D-3 이내는 soon).
 */
export function getUrgency(daysLeft: number): Urgency {
  if (daysLeft <= 0) return "danger";
  if (daysLeft <= DUE_SOON_DAYS) return "soon";
  return "normal";
}

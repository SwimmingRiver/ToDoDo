// client/src/shared/utils/due.ts의 getDaysLeft/getDueBadgeLabel/isTodoOverdue 로직을
// 그대로 포팅한다. (design/spec.md "DueBadge" / "projectUtils" 절 참고)
export const DUE_SOON_DAYS = 3;

/** overdue 판정에 필요한 최소 필드만 요구한다(Todo 전체에 의존하지 않음). */
export interface TodoOverdueLike {
  dueAt: string | null;
  status: string;
}

/**
 * todo 하나가 기한 초과(overdue)인지 판정하는 최소 단위 로직.
 * dueAt이 없거나 status가 "done"이면 false, 그 외에는 getDaysLeft(로컬 자정 기준)가
 * 음수인지로 판단한다. projectUtils.getProjectOverdue가 이 함수를 사용한다.
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
 * daysLeft(getDaysLeft 결과)를 3단계 긴급도로 분류한다. D-day(0)는 지난 것과
 * 동일하게 "danger"로 묶는다(client/src/shared/utils/due.ts와 동일 정책).
 */
export function getUrgency(daysLeft: number): Urgency {
  if (daysLeft <= 0) return "danger";
  if (daysLeft <= DUE_SOON_DAYS) return "soon";
  return "normal";
}

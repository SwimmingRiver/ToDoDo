export const DUE_SOON_DAYS = 3;

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

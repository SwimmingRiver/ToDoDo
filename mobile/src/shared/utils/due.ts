// client/src/shared/utils/due.ts의 getDaysLeft/getDueBadgeLabel 로직을 그대로 포팅한다.
// (design/spec.md "DueBadge" 절 참고)
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

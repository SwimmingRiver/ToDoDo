// client/src/shared/utils/due.ts의 getDaysLeft/getDueBadgeLabel/isTodoOverdue 로직을
// 그대로 포팅한다. (design/spec.md "DueBadge" / "projectUtils" 절 참고)
import { formatDueTime } from "./formatToday";

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

export function getDaysLeft(dueAt: string, now: Date = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDueBadgeLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}일 초과`;
  if (daysLeft === 0) return "D-day";
  return `D-${daysLeft}`;
}

const MINUTE_MS = 60 * 1000;

/**
 * 긴급(soon/danger) 마감 배지 문구. 웹 getDueLabel과 같은 규칙.
 * - 당일: "3시간 남음"/"40분 남음", 지나면 "2시간 지남"/"40분 지남"
 *   (남은 분은 올림, 지난 분은 내림하되 최소 1 — 마감 순간은 "1분 지남")
 * - 당일인데 자정(시각 없음) 마감: "D-day"
 * - 1일 이상 남음: "D-1 · 14:30" (자정 마감이면 "D-1")
 * - 1일 이상 지남: "N일 초과"
 */
export function getDueLabel(dueAt: string, now: Date): string {
  const daysLeft = getDaysLeft(dueAt, now);
  if (daysLeft < 0) return getDueBadgeLabel(daysLeft);

  const time = formatDueTime(dueAt);
  if (daysLeft > 0) {
    return time ? `${getDueBadgeLabel(daysLeft)} · ${time}` : getDueBadgeLabel(daysLeft);
  }
  if (!time) return getDueBadgeLabel(daysLeft);

  const diff = new Date(dueAt).getTime() - now.getTime();
  const isBefore = diff > 0;
  const minutes = isBefore
    ? Math.ceil(diff / MINUTE_MS)
    : Math.max(1, Math.floor(-diff / MINUTE_MS));
  const amount = minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간`;
  return `${amount} ${isBefore ? "남음" : "지남"}`;
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

import { parseLocalDateOnly, isSameLocalDay } from "./date";

const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/**
 * 날짜 타이틀 포맷.
 * - 오늘이면 "6월 15일, 오늘"
 * - 오늘이 아니면 "6월 16일, 화요일"
 */
export function formatTodayLabel(date: string): string {
  const target = parseLocalDateOnly(date);
  const today = new Date();

  const month = target.getMonth() + 1;
  const day = target.getDate();
  const datePart = `${month}월 ${day}일`;

  if (isSameLocalDay(target, today)) {
    return `${datePart}, 오늘`;
  }

  const weekday = WEEKDAY_LABELS[target.getDay()];
  return `${datePart}, ${weekday}`;
}

/**
 * 마감 시각 포맷. "오후 2시" 형태.
 * dueAt이 자정(00:00, 시간 정보 없음으로 간주)이면 null을 반환한다.
 */
export function formatDueTime(dueAt: string): string | null {
  const due = new Date(dueAt);

  const hours = due.getHours();
  const minutes = due.getMinutes();

  if (hours === 0 && minutes === 0) {
    return null;
  }

  const period = hours < 12 ? "오전" : "오후";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${period} ${hour12}시`;
}

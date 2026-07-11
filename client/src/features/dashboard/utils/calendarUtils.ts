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

/**
 * FC event.start/end Date → 해당 달력 날짜의 로컬 자정을 UTC Z ISO 문자열로 변환.
 * timeZone:'local'(이 앱의 기본값)에서 event.start/end는 dateEnv.toDate()를 거쳐
 * "달력 날짜의 로컬 자정" Date로 방출되므로 로컬 게터로 읽어야 한다.
 * (moreLinkClick의 info.date 같은 raw 마커는 반대로 UTC 필드에 달력 날짜를 담는다 —
 * UTC 게터로 읽으면 UTC+9에서 모든 드래그가 하루 이르게 저장된다.)
 */
function eventDateToLocalMidnightIso(eventDate: Date, dayOffset = 0): string {
  const localMidnight = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate() + dayOffset,
  );
  return localMidnight.toISOString();
}

/**
 * 캘린더 드래그 결과를 저장용 dueAt/startAt으로 변환합니다.
 * dueAt/startAt은 UTC Z 문자열 저장이 규칙(todoForm과 동일하게 toISOString)이며,
 * naive "YYYY-MM-DDT00:00" 문자열을 저장하면 안 됩니다.
 *
 * @param start FC event.start (달력 날짜의 로컬 자정 Date)
 * @param end FC event.end — 배타적(+1일)이므로 실제 dueAt은 하루 전
 * @param currentStartAt 기존 startAt — 있을 때만 startAt을 함께 갱신(없으면 undefined 반환)
 */
export function getDropDates(
  start: Date | null,
  end: Date | null,
  currentStartAt: string | null,
): { newDueAt: string | null; newStartAt: string | undefined } {
  let newDueAt: string | null = null;
  if (end) {
    newDueAt = eventDateToLocalMidnightIso(end, -1);
  } else if (start) {
    newDueAt = eventDateToLocalMidnightIso(start);
  }

  let newStartAt: string | undefined = undefined;
  if (currentStartAt && start) {
    newStartAt = eventDateToLocalMidnightIso(start);
  }

  return { newDueAt, newStartAt };
}

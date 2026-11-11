import { isTodoOverdue } from "@/shared/utils/due";
import type { Todo } from "@/features/todo/types/todo.type";
import { parseLocalDateOnly, toDateKey, toDateKeyFromISO } from "@/shared/utils/date";

/**
 * todo가 기한 초과인지 판단합니다.
 * dueAt이 오늘 이전이고 status가 'done'이 아닌 경우 true를 반환합니다.
 * 실제 판정 로직은 shared/utils/due.ts의 isTodoOverdue(공용 최소 단위 판정)에 위임한다.
 */
export function isOverdue(todo: Todo): boolean {
  return isTodoOverdue(todo);
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

/**
 * 구글 오버레이 이벤트가 dateKey("yyyy-MM-dd") 날짜에 걸쳐 있는지 판정한다.
 * calendar-proxy Worker는 종일 이벤트를 "yyyy-MM-dd"(end 배타), 시간 이벤트를
 * 오프셋 포함 ISO로 준다. 격자(FC)가 그리는 칸과 바텀시트 목록이 어긋나지 않도록
 * 같은 규칙 — end 배타, 로컬 날짜 기준 — 을 따른다.
 */
export function isDateInGoogleEventRange(
  dateKey: string,
  event: { start: string; end: string },
): boolean {
  if (!event.start) return false;
  const startKey = toDateKeyFromISO(event.start);

  let endKey = startKey;
  if (event.end) {
    // end가 배타적이므로 1ms(시간) 또는 하루(종일)를 빼서 마지막 포함 날짜를 구한다 —
    // 자정에 끝나는 이벤트가 다음 날까지 잡히지 않게 하기 위함
    const lastIncluded = event.end.includes("T")
      ? new Date(new Date(event.end).getTime() - 1)
      : (() => {
          const d = parseLocalDateOnly(event.end);
          d.setDate(d.getDate() - 1);
          return d;
        })();
    endKey = toDateKey(lastIncluded);
    if (endKey < startKey) endKey = startKey;
  }

  return startKey <= dateKey && dateKey <= endKey;
}

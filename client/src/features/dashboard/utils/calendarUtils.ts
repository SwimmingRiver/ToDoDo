import { isTodoOverdue } from "@/shared/utils/due";
import type { Todo } from "@/features/todo/types/todo.type";

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

export { isDateInGoogleEventRange } from "@tododo/core/dist/calendarSync/index.js";

/* ───────────── 캘린더 URL 상태(보던 기간·뷰·열린 날짜 시트) ─────────────
 * 상세(/todo/:id)로 갔다가 뒤로 오면 캘린더가 다시 마운트된다. 상태를 컴포넌트 안에만
 * 두면 보던 달·뷰·시트가 전부 초기값으로 돌아가므로 search params에 보존한다.
 * URL은 사용자가 직접 고칠 수 있는 입력이라, 형식·실재하는 날짜·범위를 모두 확인하고
 * 하나라도 어긋나면 기본값(null)으로 처리한다.
 */

export const CALENDAR_PARAM = {
  date: "date",
  view: "view",
  sheet: "sheet",
} as const;

export type CalendarView = "dayGridMonth" | "dayGridWeek";

const VIEW_TO_PARAM: Record<CalendarView, string> = {
  dayGridMonth: "month",
  dayGridWeek: "week",
};

/** FC가 다루기 어려운 먼 과거/미래(오타 등)는 기본값으로 돌린다. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * URL 값이 실재하는 "yyyy-MM-dd" 날짜면 그대로, 아니면 null.
 * 연/월/일로 로컬 Date를 만들어 다시 키로 바꿨을 때 같아야 한다 — "2026-02-30"처럼
 * Date가 다음 달로 넘겨버리는 값을 거른다. `new Date("yyyy-MM-dd")`(UTC 자정 해석)는
 * 음수 오프셋에서 하루 당겨지므로 쓰지 않는다.
 */
export function parseDateKeyParam(value: string | null): string | null {
  if (!value) return null;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return value;
}

export function parseViewParam(value: string | null): CalendarView | null {
  if (value === VIEW_TO_PARAM.dayGridMonth) return "dayGridMonth";
  if (value === VIEW_TO_PARAM.dayGridWeek) return "dayGridWeek";
  return null;
}

export interface CalendarUrlState {
  /** 보던 기간의 기준 날짜. null이면 오늘이 들어 있는 기간(기본값) */
  anchorDate: string | null;
  view: CalendarView;
  /** 열린 날짜 시트. null이면 닫힘 */
  sheetDate: string | null;
}

export function readCalendarUrlState(params: URLSearchParams): CalendarUrlState {
  return {
    anchorDate: parseDateKeyParam(params.get(CALENDAR_PARAM.date)),
    view: parseViewParam(params.get(CALENDAR_PARAM.view)) ?? "dayGridMonth",
    sheetDate: parseDateKeyParam(params.get(CALENDAR_PARAM.sheet)),
  };
}

/**
 * 상태를 params에 반영한다(제자리 수정). 기본값은 파라미터를 지워 URL을 깨끗하게 두고,
 * 캘린더가 쓰지 않는 다른 파라미터(OAuth 콜백 등)는 건드리지 않는다.
 */
export function writeCalendarUrlState(params: URLSearchParams, state: CalendarUrlState): void {
  const set = (key: string, value: string | null) => {
    if (value == null) params.delete(key);
    else params.set(key, value);
  };
  set(CALENDAR_PARAM.date, state.anchorDate);
  set(CALENDAR_PARAM.view, state.view === "dayGridMonth" ? null : VIEW_TO_PARAM[state.view]);
  set(CALENDAR_PARAM.sheet, state.sheetDate);
}

// client/src/shared/utils/date.ts + dateRange.ts의 로직을 그대로 포팅한다.
// dueAt/startAt은 UTC Z ISO 문자열로 저장되므로, 날짜만 뽑을 때 split("T")[0]을
// 쓰면 KST 등에서 하루 밀린다 — 반드시 new Date(iso)로 파싱 후 로컬 게터를 쓴다.

export type DayMarker = "none" | "normal" | "danger";

export interface TodoRangeLike {
  startAt: string | null;
  dueAt: string | null;
}

/** "yyyy-MM-dd" 문자열을 로컬 타임존 기준 Date로 변환한다. */
export const parseLocalDateOnly = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

/** Date를 로컬 타임존 기준 "yyyy-MM-dd" 문자열로 변환한다. */
export const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * ISO(또는 date-only) 문자열을 로컬 타임존 기준 "yyyy-MM-dd" 키로 변환한다.
 * "T"가 없는 순수 date-only 문자열은 이미 로컬 달력 날짜이므로 그대로 반환한다.
 */
export const toDateKeyFromISO = (iso: string): string =>
  iso.includes("T") ? toDateKey(new Date(iso)) : iso;

export const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const STRIP_WINDOW_DAYS = 7;

/** startDateKey부터 count일 연속 Date를 반환한다. */
export const getStripDates = (startDateKey: string, count: number = STRIP_WINDOW_DAYS): Date[] => {
  const start = parseLocalDateOnly(startDateKey);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

/**
 * dateKey(로컬 "yyyy-MM-dd")가 todo의 [startAt, dueAt] 구간에 포함되는지 판정한다.
 * - 시작일/마감일 모두 없으면 false
 * - 시작일만 있으면 시작일과 정확히 일치할 때만 true
 * - 마감일만 있으면 마감일과 정확히 일치할 때만 true
 * - 둘 다 있으면 시작일 <= dateKey <= 마감일
 */
export function isDateInTodoRange(dateKey: string, todo: TodoRangeLike): boolean {
  const start = todo.startAt ? toDateKeyFromISO(todo.startAt) : null;
  const end = todo.dueAt ? toDateKeyFromISO(todo.dueAt) : null;

  if (start && !end) return start === dateKey;
  if (!start && end) return end === dateKey;
  if (start && end) return dateKey >= start && dateKey <= end;

  return false;
}

export interface PeriodProgress {
  /** 1부터 시작하는 진행 일차 */
  dayIndex: number;
  /** startAt~dueAt 총 일수(양 끝 포함) */
  totalDays: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** fromKey부터 toKey까지 며칠째인지(양 끝 포함, fromKey === toKey면 1) 계산한다. */
function diffDaysInclusive(fromKey: string, toKey: string): number {
  const from = parseLocalDateOnly(fromKey);
  const to = parseLocalDateOnly(toKey);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

/**
 * dateKey 시점에 todo가 startAt~dueAt 기간 중 몇 일차/총 며칠인지 계산한다.
 * startAt이 없거나 startAt·dueAt의 로컬 날짜가 같으면(단일 마감일 항목) null.
 */
export function getPeriodProgress(dateKey: string, todo: TodoRangeLike): PeriodProgress | null {
  if (!todo.startAt || !todo.dueAt) return null;

  const startKey = toDateKeyFromISO(todo.startAt);
  const endKey = toDateKeyFromISO(todo.dueAt);
  if (startKey === endKey) return null;

  return {
    dayIndex: diffDaysInclusive(startKey, dateKey),
    totalDays: diffDaysInclusive(startKey, endKey),
  };
}

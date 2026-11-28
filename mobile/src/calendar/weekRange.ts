import { parseLocalDateOnly, toDateKey } from "../shared/utils/dateRange";

/**
 * 캘린더 주간 보기의 주 계산. 주는 일요일 시작(월간 Calendar의 firstDay 기본값 0과 같다).
 * 날짜 이동은 로컬 Date의 setDate로 한다 — 24시간을 더하면 서머타임이 있는 시간대에서
 * 하루가 겹치거나 빠진다.
 */

export interface VisibleMonth {
  year: number;
  /** 1~12 (react-native-calendars DateData.month와 같은 규칙). */
  month: number;
}

const WEEK_DAYS = 7;

const addDays = (dateKey: string, days: number): string => {
  const date = parseLocalDateOnly(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

/** 그 날짜가 든 주의 일요일 키. */
export const getWeekStartKey = (dateKey: string): string =>
  addDays(dateKey, -parseLocalDateOnly(dateKey).getDay());

export const shiftWeekKey = (weekStartKey: string, weeks: number): string => addDays(weekStartKey, weeks * WEEK_DAYS);

/** 일요일부터 토요일까지 7개 날짜 키. */
export const getWeekDateKeys = (weekStartKey: string): string[] =>
  Array.from({ length: WEEK_DAYS }, (_, i) => addDays(weekStartKey, i));

/** "11월 22일 – 28일" / "11월 29일 – 12월 5일" / 시작 연도가 올해가 아니면 "2027년 3월 7일 – 13일". */
export const formatWeekLabel = (weekStartKey: string, today: Date): string => {
  const start = parseLocalDateOnly(weekStartKey);
  const end = parseLocalDateOnly(addDays(weekStartKey, WEEK_DAYS - 1));
  const yearPrefix = start.getFullYear() !== today.getFullYear() ? `${start.getFullYear()}년 ` : "";
  const startLabel = `${yearPrefix}${start.getMonth() + 1}월 ${start.getDate()}일`;
  const endLabel =
    end.getMonth() === start.getMonth() ? `${end.getDate()}일` : `${end.getMonth() + 1}월 ${end.getDate()}일`;
  return `${startLabel} – ${endLabel}`;
};

const isInMonth = (dateKey: string, { year, month }: VisibleMonth): boolean => {
  const date = parseLocalDateOnly(dateKey);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
};

/**
 * 월간 → 주간으로 바꿀 때 보여 줄 주. 보던 달 안에 고른 날짜가 있으면 그 주,
 * 아니면 보던 달이 이번 달이면 이번 주, 아니면 그 달 1일이 든 주.
 * 시트를 닫아도 selectedDate는 남으므로 다른 달로 넘긴 뒤의 옛 선택은 무시한다.
 */
export const weekStartForMonthToWeek = ({
  selectedDate,
  visibleMonth,
  today,
}: {
  selectedDate: string | null;
  visibleMonth: VisibleMonth;
  today: Date;
}): string => {
  if (selectedDate && isInMonth(selectedDate, visibleMonth)) return getWeekStartKey(selectedDate);
  const todayKey = toDateKey(today);
  if (isInMonth(todayKey, visibleMonth)) return getWeekStartKey(todayKey);
  return getWeekStartKey(toDateKey(new Date(visibleMonth.year, visibleMonth.month - 1, 1)));
};

/** 주간 → 월간으로 바꿀 때 보여 줄 달. 그 주에 오늘이 있으면 오늘의 달, 아니면 일요일이 속한 달. */
export const monthForWeekToMonth = (weekStartKey: string, today: Date): VisibleMonth => {
  const todayKey = toDateKey(today);
  const base = getWeekDateKeys(weekStartKey).includes(todayKey) ? today : parseLocalDateOnly(weekStartKey);
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
};

/**
 * 주가 걸친 달(첫째, 둘째 또는 null). 주간 보기도 구글 일정을 월간과 같은 달 단위로 조회해
 * 같은 쿼리 캐시를 쓰게 한다 — 주 범위로 조회하면 주를 넘길 때마다 calendar-proxy를 다시 불러
 * 요청 한도를 쓸데없이 쓴다.
 */
export const monthsForWeek = (weekStartKey: string): [VisibleMonth, VisibleMonth | null] => {
  const start = parseLocalDateOnly(weekStartKey);
  const end = parseLocalDateOnly(addDays(weekStartKey, WEEK_DAYS - 1));
  const first = { year: start.getFullYear(), month: start.getMonth() + 1 };
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  return [first, sameMonth ? null : { year: end.getFullYear(), month: end.getMonth() + 1 }];
};

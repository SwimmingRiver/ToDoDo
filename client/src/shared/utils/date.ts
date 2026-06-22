/**
 * "yyyy-MM-dd" 형태의 날짜 문자열을 로컬 타임존 기준 Date로 변환한다.
 * `new Date("yyyy-MM-dd")`는 UTC 자정으로 해석되어 타임존에 따라
 * 하루가 어긋날 수 있으므로, 연/월/일을 분리해 로컬 Date를 직접 생성한다.
 */
export const parseLocalDateOnly = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

/** Date를 로컬 타임존 기준 "yyyy-MM-dd" 문자열로 변환한다. */
export const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** ISO 문자열을 로컬 타임존 기준 "yyyy-MM-dd" 키로 변환한다. */
export const toDateKeyFromISO = (iso: string): string => toDateKey(new Date(iso));

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

/** selectedDate가 속한 주(일~토)의 7개 Date를 반환한다. */
export const getWeekDates = (selectedDate: string): Date[] => {
  const target = parseLocalDateOnly(selectedDate);
  const sunday = new Date(target);
  sunday.setDate(target.getDate() - target.getDay());

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
};

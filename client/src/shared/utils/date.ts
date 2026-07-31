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

/**
 * ISO(또는 date-only) 문자열을 로컬 타임존 기준 "yyyy-MM-dd" 키로 변환한다.
 * dueAt/startAt은 보통 UTC Z ISO 문자열로 저장되므로 `new Date(iso)`로 파싱한 뒤
 * 로컬 게터로 날짜를 뽑아야 한다. "T"가 없는 순수 date-only 문자열("yyyy-MM-dd")은
 * 이미 로컬 달력 날짜이므로 파싱 없이 그대로 반환한다 — `new Date("yyyy-MM-dd")`는
 * UTC 자정으로 해석되어 UTC보다 느린(음수 오프셋) 타임존에서 하루 당겨지는 버그가
 * 있다(구 `calendar.tsx`의 `toLocalDateOnly`와 동일 원칙을 통합).
 */
export const toDateKeyFromISO = (iso: string): string =>
  iso.includes("T") ? toDateKey(new Date(iso)) : iso;

/**
 * ISO 문자열을 <input type="datetime-local">에 넣을 로컬 타임존 기준
 * "yyyy-MM-ddTHH:mm" 값으로 변환한다. `new Date(iso).toISOString().slice(0, 16)`은
 * UTC 시각을 반환하므로, UTC보다 시간이 빠른 타임존(예: Asia/Seoul)에서 자정 근처
 * 시각을 다루면 날짜가 하루 전으로 밀려 보이는 문제가 있다.
 */
export const toDatetimeLocalValue = (iso: string): string => {
  const d = new Date(iso);
  const hours = `${d.getHours()}`.padStart(2, "0");
  const minutes = `${d.getMinutes()}`.padStart(2, "0");
  return `${toDateKey(d)}T${hours}:${minutes}`;
};

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

/**
 * 로컬 달력 날짜 키("yyyy-MM-dd") 헬퍼. dueAt/doneAt은 UTC ISO 문자열로 저장되어
 * 있으므로 "며칠 차이"를 ms 뺄셈으로 구하면 DST/타임존 경계에서 하루가 어긋난다.
 * 여기 함수들은 항상 로컬 게터(getFullYear/getMonth/getDate)로 키를 만들고 키
 * 문자열끼리 비교/가감한다. client/src/shared/utils/date.ts의 toDateKey /
 * toDateKeyFromISO와 동일 구현 — core는 client를 import할 수 없어 복제한다.
 */
const pad2 = (n) => `${n}`.padStart(2, "0");
/** Date → 로컬 "yyyy-MM-dd". */
export const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
/** ISO(또는 date-only) 문자열 → 로컬 "yyyy-MM-dd". date-only는 이미 달력 날짜라 그대로. */
export const toDateKeyFromISO = (iso) => iso.includes("T") ? toDateKey(new Date(iso)) : iso;
/** "yyyy-MM-dd" → 로컬 자정 Date. `new Date("yyyy-MM-dd")`는 UTC 자정이라 쓰지 않는다. */
export const parseDateKey = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
};
/** 날짜 키에 일수를 더한다(음수 가능). 월/연 경계는 Date#setDate가 처리한다. */
export const addDaysToKey = (key, days) => {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + days);
    return toDateKey(d);
};
/** "yyyy-MM-dd" → "yyyy-MM". */
export const toMonthKey = (dateKey) => dateKey.slice(0, 7);
/** "yyyy-MM"에 개월 수를 더한다(음수 가능). */
export const addMonthsToMonthKey = (monthKey, months) => {
    const [year, month] = monthKey.split("-").map(Number);
    const d = new Date(year, month - 1 + months, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/**
 * 두 날짜 키 사이의 달력 일수(toKey - fromKey). 로컬 자정끼리의 ms 차이를 하루로
 * 나눈 뒤 반올림해서, DST로 23/25시간짜리 날이 끼어도 정수 일수가 유지된다.
 */
export const diffDaysBetweenKeys = (fromKey, toKey) => Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / MS_PER_DAY);

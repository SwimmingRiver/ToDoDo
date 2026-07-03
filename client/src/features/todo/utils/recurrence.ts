import type { RecurrenceRule } from "../types/todo.type";

/** 반복 인스턴스를 미리 생성해두는 기본 기간(주). schedule-manager 스프린트 계획 기준. */
export const RECURRENCE_HORIZON_WEEKS = 4;

/**
 * 오늘(또는 지정한 기준일)로부터 RECURRENCE_HORIZON_WEEKS(4주) 뒤 시점을 반환한다.
 * generateRecurringDueDates의 horizonEnd 기본값으로 사용.
 */
export function getDefaultHorizonEnd(from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + RECURRENCE_HORIZON_WEEKS * 7);
  return result;
}

/** year/month(0-indexed) 기준 마지막 날짜(28~31)를 반환한다. */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 시각(시/분/초/밀리초)만 base 기준으로 맞춰 새 Date를 반환한다. */
function applyTimeOfDay(date: Date, base: Date): Date {
  const result = new Date(date);
  result.setHours(
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  );
  return result;
}

/** 날짜의 자정(00:00:00.000)을 반환한다 (날짜 단위 비교용). */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** 날짜의 23:59:59.999를 반환한다 (경계 포함 비교용). */
function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * "YYYY-MM-DD" date-only 문자열(<input type="date"> 값)을 로컬 자정 Date로 만든다.
 * new Date("YYYY-MM-DD")로 바로 파싱하면 UTC 자정으로 해석되어, UTC보다 시간이
 * 느린 타임존(예: America/New_York)에서는 하루 전 날짜로 밀리는 문제가 있다.
 */
function parseDateOnlyLocal(dateOnlyStr: string): Date {
  const [y, m, d] = dateOnlyStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 실제 종료 시점을 계산한다: endType이 untilDate이면 endDate와 horizonEnd 중 더 이른 날짜,
 * 무기한(indefinite)이면 horizonEnd 그대로.
 */
function resolveEffectiveEnd(rule: RecurrenceRule, horizonEnd: Date): Date {
  if (rule.endType === "untilDate" && rule.endDate) {
    const endDate = parseDateOnlyLocal(rule.endDate);
    if (!Number.isNaN(endDate.getTime()) && endDate.getTime() < horizonEnd.getTime()) {
      return endDate;
    }
  }
  return horizonEnd;
}

/**
 * baseDueAt(최초 dueAt)과 반복 규칙을 받아 horizonEnd(또는 endDate, 더 이른 쪽)까지
 * 생성해야 할 인스턴스들의 dueAt(ISO string) 목록을 반환한다. baseDueAt 시각(시:분)은
 * 모든 인스턴스에 동일하게 적용된다.
 *
 * - daily: 매일 하나씩
 * - weekly: rule.weekdays에 해당하는 요일마다 하나씩 (0=일~6=토). baseDueAt의 요일이
 *   weekdays에 포함되지 않으면 baseDueAt 자체는 결과에 포함되지 않을 수 있다(요일 규칙이
 *   최우선 기준이므로) — 시작점은 baseDueAt이지만 실제 발생일은 요일 규칙을 따른다.
 * - monthly: baseDueAt의 day(일)를 유지. 해당 월에 그 날짜가 없으면(예: 31일, 2월)
 *   그 달의 마지막 날로 생성한다.
 */
export function generateRecurringDueDates(
  baseDueAt: string,
  rule: RecurrenceRule,
  horizonEnd: Date,
): string[] {
  const base = new Date(baseDueAt);
  if (Number.isNaN(base.getTime())) return [];

  const effectiveEnd = endOfDay(resolveEffectiveEnd(rule, horizonEnd));
  const baseDayStart = startOfDay(base);
  const results: string[] = [];

  if (rule.type === "daily") {
    const cursor = new Date(baseDayStart);
    while (cursor.getTime() <= effectiveEnd.getTime()) {
      results.push(applyTimeOfDay(cursor, base).toISOString());
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  if (rule.type === "weekly") {
    const weekdays = rule.weekdays ?? [];
    if (weekdays.length === 0) return [];
    const cursor = new Date(baseDayStart);
    while (cursor.getTime() <= effectiveEnd.getTime()) {
      if (weekdays.includes(cursor.getDay())) {
        results.push(applyTimeOfDay(cursor, base).toISOString());
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  // monthly: baseDueAt의 day를 유지하되, 없는 날짜는 그 달의 마지막 날로 클램핑한다.
  const day = base.getDate();
  let year = base.getFullYear();
  let month = base.getMonth();

  for (;;) {
    const lastDay = getLastDayOfMonth(year, month);
    const occurrence = startOfDay(new Date(year, month, Math.min(day, lastDay)));
    if (occurrence.getTime() > effectiveEnd.getTime()) break;
    if (occurrence.getTime() >= baseDayStart.getTime()) {
      results.push(applyTimeOfDay(occurrence, base).toISOString());
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return results;
}

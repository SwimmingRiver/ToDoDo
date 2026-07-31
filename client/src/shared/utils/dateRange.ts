import { parseLocalDateOnly, toDateKeyFromISO } from "./date";

/** startAt/dueAt range 판정에 필요한 최소 필드만 요구한다(Todo 전체에 의존하지 않음). */
export interface TodoRangeLike {
  startAt: string | null;
  dueAt: string | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * dateKey(로컬 "yyyy-MM-dd")가 todo의 [startAt, dueAt] 구간에 포함되는지 판정한다.
 * `calendar.tsx`의 `selectedDateTodos` 필터와 동일한 정책(동작 보존, 재사용을 위해 추출):
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

/**
 * dateKey 시점에 todo가 startAt~dueAt 기간 중 몇 일차 / 총 며칠인지 계산한다.
 * startAt이 없거나 startAt·dueAt의 로컬 날짜가 같은 경우(=단일 마감일 항목)는
 * "기간 항목"이 아니므로 null을 반환한다. dateKey가 기간 밖이어도 계산 자체는
 * 수행한다(1 미만이거나 totalDays 초과 값이 나올 수 있음 — 호출측에서 범위 내
 * 날짜만 넘기는 것을 전제로 한다, 예: `isDateInTodoRange`로 먼저 걸러진 목록).
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

/** fromKey부터 toKey까지 며칠째인지(양 끝 포함, fromKey === toKey면 1) 계산한다. */
function diffDaysInclusive(fromKey: string, toKey: string): number {
  const from = parseLocalDateOnly(fromKey);
  const to = parseLocalDateOnly(toKey);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

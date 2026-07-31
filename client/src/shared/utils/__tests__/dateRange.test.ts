import { describe, it, expect } from 'vitest'
import { isDateInTodoRange, getPeriodProgress } from '../dateRange'

// 로컬 타임존 기준 특정 시각의 UTC ISO 문자열을 만든다. dueAt/startAt은 UTC Z
// 문자열로 저장되므로(toISOString), "yyyy-MM-ddT..Z"를 직접 하드코딩하면 실행
// 머신의 로컬 타임존에 따라 로컬 날짜가 하루 밀려 보일 수 있다(KST에서 확인됨).
// new Date(y, m-1, d, h)로 로컬 시각을 만든 뒤 toISOString()하면 어떤 타임존에서
// 실행해도 왕복이 대칭이라 항상 의도한 로컬 날짜로 복원된다.
const localISO = (y: number, m: number, d: number, h = 9): string =>
  new Date(y, m - 1, d, h).toISOString()

describe('isDateInTodoRange', () => {
  it('startAt/dueAt이 모두 없으면 false를 반환해야 한다', () => {
    expect(isDateInTodoRange('2026-06-15', { startAt: null, dueAt: null })).toBe(false)
  })

  it('startAt만 있으면 startAt 날짜와 정확히 일치할 때만 true여야 한다', () => {
    const todo = { startAt: localISO(2026, 6, 15), dueAt: null }
    expect(isDateInTodoRange('2026-06-15', todo)).toBe(true)
    expect(isDateInTodoRange('2026-06-16', todo)).toBe(false)
  })

  it('dueAt만 있으면 dueAt 날짜와 정확히 일치할 때만 true여야 한다(단일 마감일 항목, 기존 동작)', () => {
    const todo = { startAt: null, dueAt: localISO(2026, 6, 15) }
    expect(isDateInTodoRange('2026-06-15', todo)).toBe(true)
    expect(isDateInTodoRange('2026-06-14', todo)).toBe(false)
  })

  it('startAt/dueAt이 모두 있으면 그 구간(양 끝 포함)에서 true여야 한다', () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) }
    expect(isDateInTodoRange('2026-06-14', todo)).toBe(true) // 시작일
    expect(isDateInTodoRange('2026-06-15', todo)).toBe(true) // 중간
    expect(isDateInTodoRange('2026-06-16', todo)).toBe(true) // 마감일
    expect(isDateInTodoRange('2026-06-13', todo)).toBe(false) // 이전
    expect(isDateInTodoRange('2026-06-17', todo)).toBe(false) // 이후
  })

  it('date-only(T 없음) 문자열도 그대로 비교할 수 있어야 한다', () => {
    const todo = { startAt: '2026-06-14', dueAt: '2026-06-16' }
    expect(isDateInTodoRange('2026-06-15', todo)).toBe(true)
  })
})

describe('getPeriodProgress', () => {
  it('startAt이 없으면 null을 반환해야 한다', () => {
    expect(getPeriodProgress('2026-06-15', { startAt: null, dueAt: localISO(2026, 6, 16) })).toBeNull()
  })

  it('dueAt이 없으면 null을 반환해야 한다', () => {
    expect(getPeriodProgress('2026-06-15', { startAt: localISO(2026, 6, 14), dueAt: null })).toBeNull()
  })

  it('startAt과 dueAt의 로컬 날짜가 같으면(단일 마감일 항목) null을 반환해야 한다', () => {
    const todo = { startAt: localISO(2026, 6, 15, 9), dueAt: localISO(2026, 6, 15, 18) }
    expect(getPeriodProgress('2026-06-15', todo)).toBeNull()
  })

  it('기간 항목의 dayIndex/totalDays를 1부터 계산해야 한다(예: 3일 중 2일차)', () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) }
    expect(getPeriodProgress('2026-06-14', todo)).toEqual({ dayIndex: 1, totalDays: 3 })
    expect(getPeriodProgress('2026-06-15', todo)).toEqual({ dayIndex: 2, totalDays: 3 })
    expect(getPeriodProgress('2026-06-16', todo)).toEqual({ dayIndex: 3, totalDays: 3 })
  })

  it('긴 기간(5일)에서도 총일수를 정확히 계산해야 한다', () => {
    const todo = { startAt: localISO(2026, 6, 1), dueAt: localISO(2026, 6, 5) }
    expect(getPeriodProgress('2026-06-03', todo)).toEqual({ dayIndex: 3, totalDays: 5 })
  })
})

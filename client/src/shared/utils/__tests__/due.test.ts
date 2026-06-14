import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getDaysLeft, getDueBadgeLabel, DUE_SOON_DAYS } from '../due'

describe('due 유틸 함수', () => {
  beforeEach(() => {
    // 2026-06-14 00:00:00 기준으로 고정
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('DUE_SOON_DAYS', () => {
    it('DUE_SOON_DAYS 상수는 3이어야 한다', () => {
      expect(DUE_SOON_DAYS).toBe(3)
    })
  })

  describe('getDaysLeft', () => {
    // getDaysLeft는 로컬 날짜(자정) 기준으로 계산하므로, 로컬 시간 기준 날짜 문자열 사용
    it('오늘 마감이면 0을 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-14')
      expect(result).toBe(0)
    })

    it('내일 마감이면 1을 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-15')
      expect(result).toBe(1)
    })

    it('3일 후 마감이면 3을 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-17')
      expect(result).toBe(3)
    })

    it('어제 마감이면 음수(-1)를 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-13')
      expect(result).toBe(-1)
    })

    it('5일 전 마감이면 -5를 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-09')
      expect(result).toBe(-5)
    })

    it('7일 후 마감이면 7을 반환해야 한다', () => {
      const result = getDaysLeft('2026-06-21')
      expect(result).toBe(7)
    })
  })

  describe('getDueBadgeLabel', () => {
    it('daysLeft가 0이면 "D-day"를 반환해야 한다', () => {
      expect(getDueBadgeLabel(0)).toBe('D-day')
    })

    it('daysLeft가 양수이면 "D-N" 형식을 반환해야 한다', () => {
      expect(getDueBadgeLabel(1)).toBe('D-1')
      expect(getDueBadgeLabel(3)).toBe('D-3')
      expect(getDueBadgeLabel(7)).toBe('D-7')
    })

    it('daysLeft가 음수이면 "N일 초과" 형식을 반환해야 한다', () => {
      expect(getDueBadgeLabel(-1)).toBe('1일 초과')
      expect(getDueBadgeLabel(-3)).toBe('3일 초과')
      expect(getDueBadgeLabel(-10)).toBe('10일 초과')
    })
  })
})

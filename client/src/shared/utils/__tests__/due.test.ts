import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getDaysLeft, getDueBadgeLabel, getDueLabel, getUrgency, DUE_SOON_DAYS, isTodoOverdue } from '../due'

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

  describe('getUrgency', () => {
    it('daysLeft가 음수(지남)이면 "danger"를 반환해야 한다', () => {
      expect(getUrgency(-1)).toBe('danger')
      expect(getUrgency(-10)).toBe('danger')
    })

    it('daysLeft가 0(D-day)이면 "danger"를 반환해야 한다', () => {
      expect(getUrgency(0)).toBe('danger')
    })

    it('daysLeft가 1~DUE_SOON_DAYS(3)이면 "soon"을 반환해야 한다', () => {
      expect(getUrgency(1)).toBe('soon')
      expect(getUrgency(2)).toBe('soon')
      expect(getUrgency(DUE_SOON_DAYS)).toBe('soon')
    })

    it('daysLeft가 DUE_SOON_DAYS(3)보다 크면 "normal"을 반환해야 한다', () => {
      expect(getUrgency(DUE_SOON_DAYS + 1)).toBe('normal')
      expect(getUrgency(10)).toBe('normal')
    })
  })

  describe('isTodoOverdue', () => {
    it('dueAt이 null이면 false를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: null, status: 'todo' })).toBe(false)
    })

    it('status가 done이면 dueAt이 과거여도 false를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: '2026-06-01', status: 'done' })).toBe(false)
    })

    it('마감일이 오늘이면 false를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: '2026-06-14', status: 'todo' })).toBe(false)
    })

    it('마감일이 어제면 true를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: '2026-06-13', status: 'todo' })).toBe(true)
    })

    it('마감일이 내일이면 false를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: '2026-06-15', status: 'todo' })).toBe(false)
    })

    it('status가 doing이고 마감일이 과거면 true를 반환해야 한다', () => {
      expect(isTodoOverdue({ dueAt: '2026-06-01', status: 'doing' })).toBe(true)
    })
  })

  describe('getDaysLeft (now 인자)', () => {
    it('now를 넘기면 그 시각의 로컬 날짜 기준으로 센다', () => {
      const dueAt = new Date(2026, 5, 16, 1, 0).toISOString()
      expect(getDaysLeft(dueAt, new Date(2026, 5, 15, 23, 59))).toBe(1)
    })
  })

  describe('getDueLabel', () => {
    const at = (d: number, h: number, mi = 0, s = 0) =>
      new Date(2026, 5, d, h, mi, s).toISOString()
    let now: Date

    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 5, 15, 12, 0))
      now = new Date()
    })

    it('당일 마감 전이면 남은 시간을 시간 단위로 보여 준다', () => {
      expect(getDueLabel(at(15, 15), now)).toBe('3시간 남음')
    })

    it('당일 60분 미만으로 남으면 분 단위로 보여 준다', () => {
      expect(getDueLabel(at(15, 12, 40), now)).toBe('40분 남음')
    })

    it('남은 분은 올림한다 (59분 59초 → 1시간, 30초 → 1분)', () => {
      expect(getDueLabel(at(15, 12, 59, 59), now)).toBe('1시간 남음')
      expect(getDueLabel(at(15, 12, 0, 30), now)).toBe('1분 남음')
    })

    it('정확히 마감 순간은 1분 지남이다', () => {
      expect(getDueLabel(at(15, 12, 0), now)).toBe('1분 지남')
    })

    it('당일 마감이 지났으면 지난 시간을 내림해서 보여 준다', () => {
      expect(getDueLabel(at(15, 11, 20), now)).toBe('40분 지남')
      expect(getDueLabel(at(15, 9, 30), now)).toBe('2시간 지남')
    })

    it('당일 자정 마감은 시각 없음으로 보고 D-day를 보여 준다', () => {
      expect(getDueLabel(at(15, 0), now)).toBe('D-day')
    })

    it('1~3일 남으면 D-n에 시각을 붙인다', () => {
      expect(getDueLabel(at(16, 14, 30), now)).toBe('D-1 · 14:30')
    })

    it('1~3일 남았는데 자정 마감이면 D-n만 보여 준다', () => {
      expect(getDueLabel(at(18, 0), now)).toBe('D-3')
    })

    it('하루 이상 지났으면 N일 초과만 보여 준다', () => {
      expect(getDueLabel(at(13, 9), now)).toBe('2일 초과')
    })

    it('밤 23:30에 다음 날 00:30 마감은 시간 단위가 아니라 D-1이다', () => {
      expect(getDueLabel(at(16, 0, 30), new Date(2026, 5, 15, 23, 30))).toBe('D-1 · 00:30')
    })

    it('자정이 지나면 어제 23:00 마감은 1일 초과다', () => {
      expect(getDueLabel(at(14, 23), new Date(2026, 5, 15, 0, 10))).toBe('1일 초과')
    })
  })
})

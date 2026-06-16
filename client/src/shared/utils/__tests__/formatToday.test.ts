import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatTodayLabel, formatDueTime } from '../formatToday'

describe('formatToday 유틸 함수', () => {
  beforeEach(() => {
    // 2026-06-15 (월요일) 기준으로 고정
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T03:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatTodayLabel', () => {
    it('오늘 날짜이면 "N월 N일, 오늘" 형식을 반환해야 한다', () => {
      expect(formatTodayLabel('2026-06-15')).toBe('6월 15일, 오늘')
    })

    it('오늘이 아니면 "N월 N일, 요일" 형식을 반환해야 한다', () => {
      expect(formatTodayLabel('2026-06-16')).toBe('6월 16일, 화요일')
    })

    it('과거 날짜도 요일 형식으로 반환해야 한다', () => {
      expect(formatTodayLabel('2026-06-14')).toBe('6월 14일, 일요일')
    })

    it('월/일이 바뀌는 경계에서도 올바르게 동작해야 한다', () => {
      expect(formatTodayLabel('2026-07-01')).toBe('7월 1일, 수요일')
    })
  })

  describe('formatDueTime', () => {
    it('오전 시간이면 "오전 N시"를 반환해야 한다', () => {
      const dueAt = new Date(2026, 5, 15, 9, 0).toISOString()
      expect(formatDueTime(dueAt)).toBe('오전 9시')
    })

    it('오후 시간이면 "오후 N시"를 반환해야 한다', () => {
      const dueAt = new Date(2026, 5, 15, 14, 0).toISOString()
      expect(formatDueTime(dueAt)).toBe('오후 2시')
    })

    it('정오(12시)는 "오후 12시"를 반환해야 한다', () => {
      const dueAt = new Date(2026, 5, 15, 12, 0).toISOString()
      expect(formatDueTime(dueAt)).toBe('오후 12시')
    })

    it('자정(00:00)이면 시간 정보 없음으로 간주하여 null을 반환해야 한다', () => {
      const dueAt = new Date(2026, 5, 15, 0, 0).toISOString()
      expect(formatDueTime(dueAt)).toBeNull()
    })

    it('분 단위가 있어도 시 단위로만 표시해야 한다', () => {
      const dueAt = new Date(2026, 5, 15, 18, 30).toISOString()
      expect(formatDueTime(dueAt)).toBe('오후 6시')
    })
  })
})

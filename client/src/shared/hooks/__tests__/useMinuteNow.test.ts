import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useMinuteNow from '../useMinuteNow'

describe('useMinuteNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('여러 컴포넌트가 구독해도 타이머는 하나만 돈다', () => {
    const a = renderHook(() => useMinuteNow())
    const b = renderHook(() => useMinuteNow())
    expect(vi.getTimerCount()).toBe(1)
    a.unmount()
    b.unmount()
  })

  it('1분이 지나면 새 현재 시각을 돌려준다', () => {
    const { result, unmount } = renderHook(() => useMinuteNow())
    const before = result.current.getTime()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.getTime() - before).toBe(60_000)
    unmount()
  })

  it('마지막 구독자가 unmount되면 타이머가 남지 않는다', () => {
    const a = renderHook(() => useMinuteNow())
    const b = renderHook(() => useMinuteNow())
    a.unmount()
    expect(vi.getTimerCount()).toBe(1)
    b.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useMediaQuery from '../useMediaQuery'

// matchMedia를 jsdom에서 사용할 수 있도록 모킹
const createMatchMedia = (matches: boolean) => {
  const listeners: Array<(event: MediaQueryListEvent) => void> = []

  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        listeners.push(handler)
      }
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        const index = listeners.indexOf(handler)
        if (index !== -1) listeners.splice(index, 1)
      }
    }),
    dispatchEvent: vi.fn(),
    _listeners: listeners,
  }))
}

describe('useMediaQuery 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('화면이 mobile 브레이크포인트(480px) 이하이면 true를 반환해야 한다', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMedia(true),
    })

    const { result } = renderHook(() => useMediaQuery('mobile'))
    expect(result.current).toBe(true)
  })

  it('화면이 mobile 브레이크포인트(480px) 이상이면 false를 반환해야 한다', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMedia(false),
    })

    const { result } = renderHook(() => useMediaQuery('mobile'))
    expect(result.current).toBe(false)
  })

  it('tablet 브레이크포인트에 대해 올바르게 동작해야 한다', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMedia(true),
    })

    const { result } = renderHook(() => useMediaQuery('tablet'))
    expect(result.current).toBe(true)
  })

  it('desktop 브레이크포인트에 대해 올바르게 동작해야 한다', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMedia(false),
    })

    const { result } = renderHook(() => useMediaQuery('desktop'))
    expect(result.current).toBe(false)
  })

  it('미디어 쿼리 변경 시 상태가 업데이트되어야 한다', () => {
    const mockMatchMedia = createMatchMedia(false)
    let capturedHandler: ((event: MediaQueryListEvent) => void) | null = null

    const mediaQueryList = {
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          capturedHandler = handler
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mediaQueryList),
    })

    const { result } = renderHook(() => useMediaQuery('mobile'))

    expect(result.current).toBe(false)

    act(() => {
      if (capturedHandler) {
        capturedHandler({ matches: true } as MediaQueryListEvent)
      }
    })

    expect(result.current).toBe(true)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { isAppleLoginOpen } from '../config'

afterEach(() => vi.unstubAllEnvs())

describe('isAppleLoginOpen', () => {
  it('공개 시각(2026-12-28 KST 00:00) 1초 전에는 닫혀 있다', () => {
    expect(isAppleLoginOpen(new Date('2026-12-27T14:59:59Z'))).toBe(false)
  })

  it('공개 시각 정각부터 열린다', () => {
    expect(isAppleLoginOpen(new Date('2026-12-27T15:00:00Z'))).toBe(true)
  })

  it('미리보기 env가 true면 공개 전에도 열린다', () => {
    vi.stubEnv('VITE_APPLE_LOGIN_PREVIEW', 'true')
    expect(isAppleLoginOpen(new Date('2026-01-01T00:00:00Z'))).toBe(true)
  })
})

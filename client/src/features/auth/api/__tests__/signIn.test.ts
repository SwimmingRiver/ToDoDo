import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signInWithPopup, updateProfile, browserPopupRedirectResolver } from 'firebase/auth'
import type { User, UserCredential } from 'firebase/auth'
import { auth, googleProvider, appleProvider } from '@/shared/lib/firebase'
import { signInWithGoogle, signInWithApple, applyAppleName, consumeLinkedNotice } from '../signIn'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  googleProvider: { id: 'google' },
  appleProvider: { id: 'apple' },
}))

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}))

const makeResult = (displayName: string | null, tokenResponse?: unknown): UserCredential =>
  ({ user: { uid: 'u1', displayName, providerData: [] }, _tokenResponse: tokenResponse }) as unknown as UserCredential

beforeEach(() => {
  vi.mocked(signInWithPopup).mockReset()
  vi.mocked(updateProfile).mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('signInWithGoogle / signInWithApple', () => {
  it('구글은 popup 처리기를 세 번째 인자로 넘긴다', async () => {
    vi.mocked(signInWithPopup).mockResolvedValue(makeResult('a'))
    await signInWithGoogle()
    expect(signInWithPopup).toHaveBeenCalledWith(auth, googleProvider, browserPopupRedirectResolver)
  })

  it('애플도 popup 처리기를 세 번째 인자로 넘기고 UserCredential을 돌려준다', async () => {
    const result = makeResult('a')
    vi.mocked(signInWithPopup).mockResolvedValue(result)
    await expect(signInWithApple()).resolves.toBe(result)
    expect(signInWithPopup).toHaveBeenCalledWith(auth, appleProvider, browserPopupRedirectResolver)
  })

  it('애플 로그인 성공 후 이름을 한국어 순서로 보정한다', async () => {
    const result = makeResult('수영 강', { firstName: '수영', lastName: '강' })
    vi.mocked(signInWithPopup).mockResolvedValue(result)
    await signInWithApple()
    expect(updateProfile).toHaveBeenCalledWith(result.user, { displayName: '강수영' })
  })

  it('이름 보정이 실패해도 로그인은 성공한다', async () => {
    const result = makeResult('수영 강', { firstName: '수영', lastName: '강' })
    vi.mocked(signInWithPopup).mockResolvedValue(result)
    vi.mocked(updateProfile).mockRejectedValue(new Error('network'))
    await expect(signInWithApple()).resolves.toBe(result)
  })
})

describe('applyAppleName', () => {
  it('이름이 다르면 updateProfile 후 true', async () => {
    const result = makeResult('수영 강', { firstName: '수영', lastName: '강' })
    await expect(applyAppleName(result)).resolves.toBe(true)
    expect(updateProfile).toHaveBeenCalledWith(result.user, { displayName: '강수영' })
  })

  it('_tokenResponse가 없으면 건드리지 않는다', async () => {
    await expect(applyAppleName(makeResult('수영 강'))).resolves.toBe(false)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('이름 필드가 문자열이 아니면 건드리지 않는다', async () => {
    await expect(applyAppleName(makeResult('x', { firstName: 1, lastName: {} }))).resolves.toBe(false)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('이미 같은 이름이면 건드리지 않는다', async () => {
    await expect(applyAppleName(makeResult('강수영', { firstName: '수영', lastName: '강' }))).resolves.toBe(false)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('updateProfile이 실패해도 던지지 않고 false', async () => {
    vi.mocked(updateProfile).mockRejectedValue(new Error('x'))
    await expect(applyAppleName(makeResult('수영 강', { firstName: '수영', lastName: '강' }))).resolves.toBe(false)
  })
})

describe('consumeLinkedNotice', () => {
  const userWith = (ids: string[]) =>
    ({ uid: 'u1', providerData: ids.map((providerId) => ({ providerId })) }) as unknown as User

  beforeEach(() => localStorage.clear())

  it('제공자가 둘이면 첫 호출만 true', () => {
    const user = userWith(['google.com', 'apple.com'])
    expect(consumeLinkedNotice(user)).toBe(true)
    expect(consumeLinkedNotice(user)).toBe(false)
  })

  it('제공자가 하나면 false', () => {
    expect(consumeLinkedNotice(userWith(['google.com']))).toBe(false)
  })

  it('localStorage가 던지면 false', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(consumeLinkedNotice(userWith(['google.com', 'apple.com']))).toBe(false)
    vi.restoreAllMocks()
  })
})

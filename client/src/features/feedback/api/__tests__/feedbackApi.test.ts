import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id', email: 'user@example.com' },
  },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

describe('feedbackApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitFeedback', () => {
    it('인증된 사용자의 uid/email과 trim된 content, ISO createdAt을 저장해야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const { submitFeedback } = await import('../feedbackApi')

      await submitFeedback('  좋아요  ')

      expect(addDoc).toHaveBeenCalledTimes(1)
      const [, payload] = vi.mocked(addDoc).mock.calls[0]
      expect(payload).toMatchObject({
        userId: 'test-user-id',
        email: 'user@example.com',
        content: '좋아요',
      })
      expect(typeof (payload as { createdAt: string }).createdAt).toBe('string')
    })

    it('빈 문자열(공백만)이면 Firestore를 호출하지 않고 에러를 던져야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const { submitFeedback } = await import('../feedbackApi')

      await expect(submitFeedback('   ')).rejects.toThrow()
      expect(addDoc).not.toHaveBeenCalled()
    })

    it('미인증 상태면 에러를 던져야 한다', async () => {
      // todoApi.test.ts와 동일한 관례: Object.defineProperty로 currentUser를 바꾼다
      const { auth } = await import('@/shared/lib/firebase')
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true })

      const { submitFeedback } = await import('../feedbackApi')

      await expect(submitFeedback('의견입니다')).rejects.toThrow('Not authenticated')

      // 이후 테스트에 영향 주지 않도록 원복
      Object.defineProperty(auth, 'currentUser', {
        value: { uid: 'test-user-id', email: 'user@example.com' },
        configurable: true,
      })
    })

    it('addDoc이 실패하면 Sentry로 캡처하고 에러를 다시 던져야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const Sentry = await import('@sentry/react')
      const { submitFeedback } = await import('../feedbackApi')

      const error = new Error('network down')
      vi.mocked(addDoc).mockRejectedValueOnce(error)

      await expect(submitFeedback('의견입니다')).rejects.toThrow('network down')
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        { tags: { feature: 'feedback' } },
      )
    })
  })
})

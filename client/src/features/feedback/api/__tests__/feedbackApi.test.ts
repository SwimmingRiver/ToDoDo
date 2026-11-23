import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authorizedFetch } = vi.hoisted(() => ({ authorizedFetch: vi.fn() }))

vi.mock('@/shared/lib/authorizedFetch', () => ({ authorizedFetch }))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response

describe('feedbackApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_FEEDBACK_PROXY_URL', 'https://fb.example.com')
  })

  describe('submitFeedback', () => {
    it('trim된 content와 platform web을 Worker로 POST해야 한다', async () => {
      authorizedFetch.mockResolvedValueOnce(res(201))
      const { submitFeedback } = await import('../feedbackApi')

      await submitFeedback('  좋아요  ')

      expect(authorizedFetch).toHaveBeenCalledTimes(1)
      expect(authorizedFetch).toHaveBeenCalledWith('https://fb.example.com', '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '좋아요', platform: 'web' }),
      })
    })

    it('빈 문자열(공백만)이면 요청 없이 에러를 던져야 한다', async () => {
      const { submitFeedback } = await import('../feedbackApi')

      await expect(submitFeedback('   ')).rejects.toThrow('피드백 내용을 입력해주세요')
      expect(authorizedFetch).not.toHaveBeenCalled()
    })

    it('429면 TOO_FREQUENT FeedbackError를 던지고 Sentry로 캡처하지 않는다', async () => {
      authorizedFetch.mockResolvedValueOnce(res(429))
      const Sentry = await import('@sentry/react')
      const { submitFeedback, FeedbackError } = await import('../feedbackApi')

      const error = await submitFeedback('의견').catch((e) => e)

      expect(error).toBeInstanceOf(FeedbackError)
      expect(error.code).toBe('TOO_FREQUENT')
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('500이면 UNKNOWN FeedbackError를 던지고 Sentry로 1회 캡처한다', async () => {
      authorizedFetch.mockResolvedValueOnce(res(500))
      const Sentry = await import('@sentry/react')
      const { submitFeedback, FeedbackError } = await import('../feedbackApi')

      const error = await submitFeedback('의견').catch((e) => e)

      expect(error).toBeInstanceOf(FeedbackError)
      expect(error.code).toBe('UNKNOWN')
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.anything(), {
        tags: { feature: 'feedback' },
      })
    })

    it('fetch가 reject되면(미인증 포함) UNKNOWN FeedbackError로 감싸 Sentry로 1회 캡처한다', async () => {
      authorizedFetch.mockRejectedValueOnce(new Error('Not authenticated'))
      const Sentry = await import('@sentry/react')
      const { submitFeedback, FeedbackError } = await import('../feedbackApi')

      const error = await submitFeedback('의견').catch((e) => e)

      expect(error).toBeInstanceOf(FeedbackError)
      expect(error.code).toBe('UNKNOWN')
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Sentry from '@sentry/react'
import ErrorBoundary from '../errorBoundary'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

const ThrowingChild = () => {
  throw new Error('boom')
}

describe('ErrorBoundary 컴포넌트', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    })
    vi.mocked(Sentry.captureException).mockClear()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('정상 렌더링 시 children을 그대로 보여준다', () => {
    render(
      <ErrorBoundary>
        <div>정상 화면</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('정상 화면')).toBeInTheDocument()
  })

  it('하위 컴포넌트가 렌더링 중 예외를 던지면 fallback UI를 보여준다', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
    expect(screen.queryByText('정상 화면')).not.toBeInTheDocument()
  })

  it('새로고침 버튼 클릭 시 페이지를 새로고침한다', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: '새로고침' }))

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('하위 컴포넌트가 예외를 던지면 Sentry.captureException을 호출한다', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('Sentry.captureException 호출 시 에러 객체와 componentStack을 담은 react 컨텍스트를 함께 전달한다', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )

    const [error, context] = vi.mocked(Sentry.captureException).mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('boom')
    expect(context).toEqual({
      contexts: {
        react: { componentStack: expect.any(String) },
      },
    })
  })

  it('정상 렌더링 시에는 Sentry.captureException을 호출하지 않는다', () => {
    render(
      <ErrorBoundary>
        <div>정상 화면</div>
      </ErrorBoundary>,
    )

    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../errorBoundary'

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
})

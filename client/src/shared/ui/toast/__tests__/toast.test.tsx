import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import Toast from '../toast'
import { ToastProvider } from '../toastContext'
import { useToast } from '../useToast'
import type { ToastData } from '../toast'

describe('Toast 컴포넌트', () => {
  const makeToast = (overrides: Partial<ToastData> = {}): ToastData => ({
    id: 'toast-1',
    type: 'success',
    title: '성공',
    duration: 3000,
    ...overrides,
  })

  it('토스트가 없으면 아무것도 렌더링하지 않아야 한다', () => {
    const { container } = render(<Toast toasts={[]} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('토스트 제목이 표시되어야 한다', () => {
    render(<Toast toasts={[makeToast({ title: '저장 완료' })]} onClose={vi.fn()} />)
    expect(screen.getByText('저장 완료')).toBeInTheDocument()
  })

  it('토스트 메시지가 표시되어야 한다', () => {
    render(
      <Toast
        toasts={[makeToast({ title: '성공', message: '할 일이 저장되었습니다' })]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('할 일이 저장되었습니다')).toBeInTheDocument()
  })

  it('메시지가 없으면 제목만 표시되어야 한다', () => {
    render(<Toast toasts={[makeToast({ title: '알림', message: undefined })]} onClose={vi.fn()} />)
    expect(screen.getByText('알림')).toBeInTheDocument()
    // message가 undefined일 때 메시지 영역이 렌더링되지 않아야 한다
    // (toast.tsx: {toast.message && <Message>{toast.message}</Message>})
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('닫기 버튼 클릭 시 onClose가 호출되어야 한다', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<Toast toasts={[makeToast({ id: 'toast-abc' })]} onClose={onClose} />)

    await user.click(screen.getByLabelText('알림 닫기'))

    expect(onClose).toHaveBeenCalledWith('toast-abc')
  })

  it('여러 토스트가 동시에 표시되어야 한다', () => {
    const toasts: ToastData[] = [
      makeToast({ id: 'toast-1', title: '첫 번째 알림', type: 'success' }),
      makeToast({ id: 'toast-2', title: '두 번째 알림', type: 'error' }),
    ]

    render(<Toast toasts={toasts} onClose={vi.fn()} />)

    expect(screen.getByText('첫 번째 알림')).toBeInTheDocument()
    expect(screen.getByText('두 번째 알림')).toBeInTheDocument()
  })
})

describe('useToast 훅', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  )

  it('ToastProvider 없이 사용하면 에러를 던져야 한다', () => {
    // console.error를 무시 (React error boundary)
    const originalError = console.error
    console.error = vi.fn()

    expect(() => {
      renderHook(() => useToast())
    }).toThrow('useToast must be used within a ToastProvider')

    console.error = originalError
  })

  it('success 메서드가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(typeof result.current.success).toBe('function')
  })

  it('error 메서드가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(typeof result.current.error).toBe('function')
  })

  it('warning 메서드가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(typeof result.current.warning).toBe('function')
  })

  it('info 메서드가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(typeof result.current.info).toBe('function')
  })

  it('success 호출 시 토스트가 화면에 표시되어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.success('성공 제목', '성공 메시지')
    })

    // ToastProvider가 렌더링하는 Toast 컴포넌트를 통해 확인
    expect(screen.getByText('성공 제목')).toBeInTheDocument()
    expect(screen.getByText('성공 메시지')).toBeInTheDocument()
  })

  it('error 호출 시 토스트가 화면에 표시되어야 한다', () => {
    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.error('오류 발생', '오류 내용')
    })

    expect(screen.getByText('오류 발생')).toBeInTheDocument()
  })
})

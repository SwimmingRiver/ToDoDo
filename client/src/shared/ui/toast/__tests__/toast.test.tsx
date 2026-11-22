import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook, act } from '@testing-library/react'
import { StrictMode, useEffect, type ReactNode } from 'react'
import Toast from '../toast'
import Modal from '../../modal/modal'
import ConfirmModal from '../../confirmModal/confirmModal'
import BottomSheet from '../../bottomSheet/bottomSheet'
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

describe('Toast 스태킹', () => {
  // 모달이 열린 채로 뜨는 토스트(AI 플랜 오류, 저장 실패 등)가 모달 배경(scrim) 아래에 깔리면
  // 흐리게 보이거나 모바일 바텀시트에 가려진다. 토스트는 모든 오버레이보다 위에 있어야 한다.
  // 요소가 실제로 놓이는 층 = 조상들 중 가장 높은 z-index
  const layerOf = (el: Element | null): number => {
    let max = 0
    for (let cur = el; cur; cur = cur.parentElement) {
      max = Math.max(max, Number(getComputedStyle(cur).zIndex) || 0)
    }
    return max
  }

  it('모달·확인 모달·바텀시트가 열려 있어도 토스트가 가장 위에 있어야 한다', () => {
    render(
      <>
        <Modal isOpen setIsOpen={vi.fn()}>본문</Modal>
        <ConfirmModal isOpen title="확인" message="정말요?" onConfirm={vi.fn()} onCancel={vi.fn()} />
        <BottomSheet isOpen onClose={vi.fn()} title="시트" />
        <Toast toasts={[{ id: 't', type: 'error', title: '오류 토스트', duration: 3000 }]} onClose={vi.fn()} />
      </>,
    )

    const toastLayer = layerOf(screen.getByText('오류 토스트'))
    const overlayLayers = [screen.getByText('본문'), screen.getByText('정말요?'), screen.getByText('시트')].map(layerOf)

    expect(Math.max(...overlayLayers)).toBeGreaterThan(0)
    for (const layer of overlayLayers) expect(toastLayer).toBeGreaterThan(layer)
  })
})

// Provider가 사라진 뒤 자동 닫힘 타이머가 남아 있으면, 테스트 환경(jsdom)이 정리된 뒤
// setState가 실행돼 'window is not defined' unhandled error로 CI가 실패했다(11-22 main CI).
describe('ToastProvider 타이머 정리', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

  it('언마운트하면 자동 닫힘 타이머가 남지 않는다', () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = renderHook(() => useToast(), { wrapper })
      act(() => result.current.success('저장 완료'))
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('닫히는 중(퇴장 애니메이션 타이머)에 언마운트해도 타이머가 남지 않는다', () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = renderHook(() => useToast(), { wrapper })
      act(() => result.current.success('저장 완료'))
      // duration(3000) 경과 → removeToast가 퇴장용 300ms 타이머를 건다
      act(() => vi.advanceTimersByTime(3000))
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  // StrictMode(개발 모드)는 첫 마운트 뒤 effect 정리를 한 번 재생한다. 그 정리에서 타이머를
  // 지우기만 하면, 자식이 첫 마운트 effect로 띄운 토스트(예: 캘린더 연동 완료)가 영영 안 닫힌다.
  it('StrictMode에서 자식이 마운트 effect로 띄운 토스트도 duration 뒤 닫힌다', () => {
    vi.useFakeTimers()
    try {
      const ShowOnMount = () => {
        const toast = useToast()
        useEffect(() => {
          toast.success('연동 완료')
          // 첫 마운트 1회만 — 실제 calendar.tsx도 ref 가드로 재실행 시 다시 띄우지 않는다
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return null
      }
      render(
        <StrictMode>
          <ToastProvider>
            <ShowOnMount />
          </ToastProvider>
        </StrictMode>,
      )
      expect(screen.getAllByText('연동 완료').length).toBeGreaterThan(0)

      act(() => vi.advanceTimersByTime(3300))

      expect(screen.queryByText('연동 완료')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('직접 닫으면 자동 닫힘 타이머도 취소돼 퇴장 뒤 남은 타이머가 없다', () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <ShowButton />
        </ToastProvider>,
      )
      act(() => screen.getByRole('button', { name: '띄우기' }).click())
      act(() => screen.getByRole('button', { name: /닫기/ }).click())
      act(() => vi.advanceTimersByTime(300))

      expect(screen.queryByText('저장 완료')).not.toBeInTheDocument()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

const ShowButton = () => {
  const toast = useToast()
  return <button onClick={() => toast.success('저장 완료')}>띄우기</button>
}

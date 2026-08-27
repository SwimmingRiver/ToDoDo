import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackButton from '../feedbackButton'

// vi.mock 팩토리는 이 파일의 다른 import보다 먼저(모듈 로드 시점에) 실행되므로,
// 나중에 선언되는 일반 let 변수를 참조하면 TDZ 에러가 난다. todoListItem.test.tsx가
// navigateSpy에 쓰는 것과 같은 관례로 vi.hoisted에 담아 참조 시점 문제를 피한다.
const { mutate, reset, mutationState } = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  mutationState: { isPending: false, isSuccess: false, isError: false },
}))

vi.mock('../../hooks', () => ({
  useSubmitFeedback: () => ({
    mutate,
    reset,
    get isPending() { return mutationState.isPending },
    get isSuccess() { return mutationState.isSuccess },
    get isError() { return mutationState.isError },
  }),
}))

describe('FeedbackButton 컴포넌트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutationState.isPending = false
    mutationState.isSuccess = false
    mutationState.isError = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('트리거 버튼만 보이고 모달은 닫혀 있어야 한다', () => {
    render(<FeedbackButton />)

    expect(screen.getByRole('button', { name: '의견 보내기' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('자유롭게 의견을 남겨주세요')).not.toBeInTheDocument()
  })

  it('트리거 버튼을 클릭하면 모달이 열리고 제출 버튼은 비어있는 동안 비활성화된다', async () => {
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('내용을 입력하면 제출 버튼이 활성화되고, 클릭하면 mutate가 호출된다', async () => {
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))
    await user.type(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요'), '좋아요')

    const submitButton = screen.getByRole('button', { name: '제출' })
    expect(submitButton).not.toBeDisabled()

    await user.click(submitButton)

    expect(mutate).toHaveBeenCalledWith('좋아요', expect.anything())
  })

  it('isSuccess가 true면 성공 메시지를 보여준다', async () => {
    mutationState.isSuccess = true
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByText('감사합니다! 의견이 전달되었습니다.')).toBeInTheDocument()
  })

  it('isError가 true면 에러 메시지를 보여준다', async () => {
    mutationState.isError = true
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByText('전송에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument()
  })

  it('성공 후 자동 닫힘 전에 사용자가 직접 닫았다가 다시 열면, 지연된 타이머가 새로 입력한 내용을 지우지 않는다', async () => {
    // 상호작용(클릭/타이핑) 자체는 실제 타이머로 진행하고, 컴포넌트 내부의
    // setTimeout(자동 닫힘)만 가짜 타이머로 통제한다 — 둘을 섞으면 userEvent의
    // 내부 대기가 fake timer에 걸려 멈춘다.
    const user = userEvent.setup()

    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))
    await user.type(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요'), '좋아요')
    await user.click(screen.getByRole('button', { name: '제출' }))

    // mutate는 mock이라 실제로 성공하지 않으므로, 전달된 onSuccess 콜백을 직접 꺼내
    // 실제 성공 시나리오(자동 닫힘 타이머 예약)를 시뮬레이션한다.
    const onSuccess = mutate.mock.calls[0][1].onSuccess

    vi.useFakeTimers()
    act(() => {
      mutationState.isSuccess = true
      onSuccess()
    })

    // 사용자가 자동 닫힘(1.2초) 타이머가 끝나기 전에 직접 "닫기"를 누른다.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }))
      mutationState.isSuccess = false // handleClose가 호출한 reset()의 효과를 시뮬레이션
    })

    // 모달을 다시 열고 새 내용을 입력한다.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '의견 보내기' }))
    })
    act(() => {
      fireEvent.change(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요'), {
        target: { value: '새 의견' },
      })
    })

    // 앞서 예약됐던 1.2초 타이머가 흘러도, 새로 입력한 내용이 지워지거나
    // 모달이 강제로 닫혀서는 안 된다.
    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요')).toHaveValue('새 의견')
  })

  it('모달은 렌더링된 컨테이너가 아니라 document.body에 직접 portal되어야 한다', async () => {
    // 모바일 드로어처럼 transform이 걸린 조상 안에 FeedbackButton이 렌더링돼도
    // Overlay(position: fixed)가 그 조상을 containing block으로 삼지 않도록,
    // 모달은 반드시 document.body의 자식으로 portal되어야 한다.
    const user = userEvent.setup()
    const { container } = render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    const textarea = screen.getByPlaceholderText('자유롭게 의견을 남겨주세요')

    // render()가 만든 컨테이너 내부에는 모달이 없어야 한다 (portal되었으므로).
    expect(container.contains(textarea)).toBe(false)
    // 대신 document.body에 직접 속해 있어야 한다.
    expect(document.body.contains(textarea)).toBe(true)
  })
})

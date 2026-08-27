import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmModal from '../confirmModal'

describe('ConfirmModal 컴포넌트', () => {
  const defaultProps = {
    isOpen: true,
    title: '삭제 확인',
    message: '정말 삭제하시겠습니까?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('isOpen이 true이면 모달이 렌더링되어야 한다', () => {
    render(<ConfirmModal {...defaultProps} />)

    expect(screen.getByText('삭제 확인')).toBeInTheDocument()
    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument()
  })

  it('isOpen이 false이면 모달이 렌더링되지 않아야 한다', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByText('삭제 확인')).not.toBeInTheDocument()
  })

  it('기본 확인 버튼 텍스트는 "삭제"여야 한다', () => {
    render(<ConfirmModal {...defaultProps} />)

    expect(screen.getByText('삭제')).toBeInTheDocument()
  })

  it('기본 취소 버튼 텍스트는 "취소"여야 한다', () => {
    render(<ConfirmModal {...defaultProps} />)

    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('커스텀 confirmText가 표시되어야 한다', () => {
    render(<ConfirmModal {...defaultProps} confirmText="확인" />)

    expect(screen.getByText('확인')).toBeInTheDocument()
  })

  it('커스텀 cancelText가 표시되어야 한다', () => {
    render(<ConfirmModal {...defaultProps} cancelText="아니요" />)

    expect(screen.getByText('아니요')).toBeInTheDocument()
  })

  it('확인 버튼 클릭 시 onConfirm이 호출되어야 한다', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />)

    await user.click(screen.getByText('삭제'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('취소 버튼 클릭 시 onCancel이 호출되어야 한다', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)

    await user.click(screen.getByText('취소'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('오버레이 클릭 시 onCancel이 호출되어야 한다', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    const { container } = render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)

    // Overlay는 컨테이너의 첫 번째 자식
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('모달 내부 클릭 시 이벤트 전파가 차단되어야 한다', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)

    // 모달 제목 클릭 - 이벤트 전파가 막혀서 onCancel이 호출되지 않아야 한다
    await user.click(screen.getByText('삭제 확인'))

    expect(onCancel).not.toHaveBeenCalled()
  })
  describe('pending (되돌릴 수 없는 작업 진행 중)', () => {
    it('확인·취소 버튼이 모두 비활성이고 aria-busy가 켜진다', () => {
      render(<ConfirmModal {...defaultProps} pending />)

      expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()
      expect(screen.getByText('삭제 확인').parentElement).toHaveAttribute('aria-busy', 'true')
    })

    it('오버레이를 눌러도 onCancel이 호출되지 않는다', async () => {
      const onCancel = vi.fn()
      const user = userEvent.setup()
      const { container } = render(<ConfirmModal {...defaultProps} onCancel={onCancel} pending />)

      await user.click(container.firstChild as HTMLElement)

      expect(onCancel).not.toHaveBeenCalled()
    })

    it('pending이 아니면 aria-busy가 없다', () => {
      render(<ConfirmModal {...defaultProps} />)
      expect(screen.getByText('삭제 확인').parentElement).not.toHaveAttribute('aria-busy')
    })
  })

  it('statusMessage는 role="status"로 읽힌다', () => {
    render(<ConfirmModal {...defaultProps} statusMessage="처리 중이에요" />)
    expect(screen.getByRole('status')).toHaveTextContent('처리 중이에요')
  })

  it('statusMessage가 없으면 status 영역도 없다', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

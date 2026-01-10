import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// 간단한 버튼 컴포넌트 테스트 예시
const Button = ({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) => (
  <button onClick={onClick} type="button">
    {children}
  </button>
)

describe('Vitest + React Testing Library 설정 확인', () => {
  it('컴포넌트가 렌더링되어야 한다', () => {
    render(<Button onClick={() => {}}>Click me</Button>)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('버튼 클릭 이벤트가 동작해야 한다', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={handleClick}>Click me</Button>)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('버튼 텍스트가 표시되어야 한다', () => {
    render(<Button onClick={() => {}}>테스트 버튼</Button>)
    expect(screen.getByText('테스트 버튼')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatusSelect from '../statusSelect'

describe('StatusSelect 컴포넌트', () => {
  it('현재 상태 "할 일"이 표시되어야 한다', () => {
    render(<StatusSelect value="todo" onChange={vi.fn()} />)
    expect(screen.getByText('할 일')).toBeInTheDocument()
  })

  it('현재 상태 "진행 중"이 표시되어야 한다', () => {
    render(<StatusSelect value="doing" onChange={vi.fn()} />)
    expect(screen.getByText('진행 중')).toBeInTheDocument()
  })

  it('현재 상태 "완료"가 표시되어야 한다', () => {
    render(<StatusSelect value="done" onChange={vi.fn()} />)
    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('버튼 클릭 시 바텀시트가 열려야 한다', async () => {
    const user = userEvent.setup()
    render(<StatusSelect value="todo" onChange={vi.fn()} />)

    await user.click(screen.getByText('할 일'))

    // 바텀시트 타이틀 확인
    expect(screen.getByText('상태 선택')).toBeInTheDocument()
  })

  it('바텀시트에서 상태 선택 시 onChange가 호출되어야 한다', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<StatusSelect value="todo" onChange={onChange} />)

    // 버튼 클릭해서 바텀시트 열기
    await user.click(screen.getByText('할 일'))

    // 바텀시트에서 "진행 중" 선택
    await user.click(screen.getByText('진행 중'))

    expect(onChange).toHaveBeenCalledWith('doing')
  })

  it('바텀시트에서 "완료" 선택 시 onChange("done")이 호출되어야 한다', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<StatusSelect value="todo" onChange={onChange} />)

    await user.click(screen.getByText('할 일'))
    await user.click(screen.getByText('완료'))

    expect(onChange).toHaveBeenCalledWith('done')
  })
})

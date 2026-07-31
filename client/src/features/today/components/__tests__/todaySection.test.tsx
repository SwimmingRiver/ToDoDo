import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodaySection from '../todaySection'

describe('TodaySection 컴포넌트', () => {
  it('title을 헤딩으로 렌더링해야 한다', () => {
    render(
      <TodaySection title="진행 중">
        <div>자식 콘텐츠</div>
      </TodaySection>,
    )

    expect(screen.getByRole('heading', { name: '진행 중' })).toBeInTheDocument()
  })

  it('children을 그대로 렌더링해야 한다', () => {
    render(
      <TodaySection title="완료">
        <p>완료된 할 일 목록</p>
      </TodaySection>,
    )

    expect(screen.getByText('완료된 할 일 목록')).toBeInTheDocument()
  })

  it('여러 children을 모두 렌더링해야 한다', () => {
    render(
      <TodaySection title="진행 중">
        <span>항목 1</span>
        <span>항목 2</span>
      </TodaySection>,
    )

    expect(screen.getByText('항목 1')).toBeInTheDocument()
    expect(screen.getByText('항목 2')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DailyProgress from '../dailyProgress'

describe('DailyProgress 컴포넌트', () => {
  it('날짜 라벨과 완료 개수를 표시해야 한다', () => {
    render(<DailyProgress dateLabel="7월 31일, 오늘" doneCount={2} totalCount={5} />)

    expect(screen.getByText('7월 31일, 오늘')).toBeInTheDocument()
    expect(screen.getByText('2 / 5 완료')).toBeInTheDocument()
  })

  it('totalCount가 0이면 진행률이 0%여야 한다', () => {
    render(<DailyProgress dateLabel="7월 31일, 오늘" doneCount={0} totalCount={0} />)

    expect(screen.getByText('0 / 0 완료')).toBeInTheDocument()
    const fill = document.querySelector('div[style]') as HTMLElement
    expect(fill).toHaveStyle({ width: '0%' })
  })

  it('doneCount와 totalCount 비율에 맞춰 진행률 바 너비를 계산해야 한다', () => {
    render(<DailyProgress dateLabel="7월 31일, 오늘" doneCount={1} totalCount={4} />)

    const fill = document.querySelector('div[style]') as HTMLElement
    expect(fill).toHaveStyle({ width: '25%' })
  })

  it('doneCount와 totalCount가 같으면 진행률이 100%여야 한다', () => {
    render(<DailyProgress dateLabel="7월 31일, 오늘" doneCount={3} totalCount={3} />)

    const fill = document.querySelector('div[style]') as HTMLElement
    expect(fill).toHaveStyle({ width: '100%' })
  })
})

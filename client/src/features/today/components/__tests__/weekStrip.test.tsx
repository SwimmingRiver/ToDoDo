import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeekStrip from '../weekStrip'
import type { DayMarker } from '../../hooks/useTodayTodos'

describe('WeekStrip 컴포넌트', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 로컬 타임존 기준 2026-07-15(수) 정오로 고정
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultProps = {
    selectedDate: '2026-07-15',
    windowStart: '2026-07-15',
    markers: {} as Record<string, DayMarker>,
    onSelectDate: vi.fn(),
    onShiftLeft: vi.fn(),
    onShiftRight: vi.fn(),
    onGoToToday: vi.fn(),
  }

  it('windowStart부터 7일치 날짜 셀을 렌더링해야 한다', () => {
    render(<WeekStrip {...defaultProps} onSelectDate={vi.fn()} />)

    // 2026-07-15 ~ 2026-07-21, 일자 숫자 라벨이 7개 존재해야 함
    for (const day of [15, 16, 17, 18, 19, 20, 21]) {
      expect(screen.getByText(String(day))).toBeInTheDocument()
    }
  })

  it('이전 버튼 클릭 시 onShiftLeft가 호출되어야 한다', () => {
    const onShiftLeft = vi.fn()
    render(<WeekStrip {...defaultProps} onShiftLeft={onShiftLeft} />)

    fireEvent.click(screen.getByLabelText('이전 날짜'))

    expect(onShiftLeft).toHaveBeenCalledTimes(1)
  })

  it('다음 버튼 클릭 시 onShiftRight가 호출되어야 한다', () => {
    const onShiftRight = vi.fn()
    render(<WeekStrip {...defaultProps} onShiftRight={onShiftRight} />)

    fireEvent.click(screen.getByLabelText('다음 날짜'))

    expect(onShiftRight).toHaveBeenCalledTimes(1)
  })

  it('날짜 셀 클릭 시 onSelectDate가 해당 날짜 키와 함께 호출되어야 한다', () => {
    const onSelectDate = vi.fn()
    render(<WeekStrip {...defaultProps} onSelectDate={onSelectDate} />)

    fireEvent.click(screen.getByLabelText('7월 18일 토요일, 일정 없음'))

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-18')
  })

  it('날짜 셀에서 Enter 키를 누르면 onSelectDate가 호출되어야 한다', () => {
    const onSelectDate = vi.fn()
    render(<WeekStrip {...defaultProps} onSelectDate={onSelectDate} />)

    fireEvent.keyDown(screen.getByLabelText('7월 16일 목요일, 일정 없음'), { key: 'Enter' })

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-16')
  })

  it('날짜 셀에서 Space 키를 누르면 onSelectDate가 호출되어야 한다', () => {
    const onSelectDate = vi.fn()
    render(<WeekStrip {...defaultProps} onSelectDate={onSelectDate} />)

    fireEvent.keyDown(screen.getByLabelText('7월 17일 금요일, 일정 없음'), { key: ' ' })

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-17')
  })

  it('선택된 날짜 셀은 aria-pressed가 true여야 한다', () => {
    render(<WeekStrip {...defaultProps} selectedDate="2026-07-16" />)

    const selectedCell = screen.getByLabelText('7월 16일 목요일, 일정 없음')
    expect(selectedCell).toHaveAttribute('aria-pressed', 'true')

    const otherCell = screen.getByLabelText('7월 17일 금요일, 일정 없음')
    expect(otherCell).toHaveAttribute('aria-pressed', 'false')
  })

  it('marker가 danger이면 "마감 위험 일정 있음"이 aria-label에 포함되어야 한다', () => {
    render(
      <WeekStrip
        {...defaultProps}
        markers={{ '2026-07-16': 'danger' }}
      />,
    )

    expect(screen.getByLabelText('7월 16일 목요일, 마감 위험 일정 있음')).toBeInTheDocument()
  })

  it('marker가 normal이면 "일정 있음"이 aria-label에 포함되어야 한다', () => {
    render(
      <WeekStrip
        {...defaultProps}
        markers={{ '2026-07-17': 'normal' }}
      />,
    )

    expect(screen.getByLabelText('7월 17일 금요일, 일정 있음')).toBeInTheDocument()
  })

  it('오늘이 스트립 범위 안에 있으면 "오늘로 이동" 버튼이 표시되지 않아야 한다', () => {
    // 시스템 시간 2026-07-15가 windowStart(2026-07-15) 범위(15~21) 안에 있음
    render(<WeekStrip {...defaultProps} />)

    expect(screen.queryByLabelText('오늘로 이동')).not.toBeInTheDocument()
  })

  it('오늘이 스트립 범위 밖에 있으면 "오늘로 이동" 버튼이 표시되어야 한다', () => {
    render(<WeekStrip {...defaultProps} windowStart="2026-08-01" selectedDate="2026-08-01" />)

    expect(screen.getByLabelText('오늘로 이동')).toBeInTheDocument()
  })

  it('"오늘로 이동" 버튼 클릭 시 onGoToToday가 호출되어야 한다', () => {
    const onGoToToday = vi.fn()
    render(
      <WeekStrip
        {...defaultProps}
        windowStart="2026-08-01"
        selectedDate="2026-08-01"
        onGoToToday={onGoToToday}
      />,
    )

    fireEvent.click(screen.getByLabelText('오늘로 이동'))

    expect(onGoToToday).toHaveBeenCalledTimes(1)
  })
})

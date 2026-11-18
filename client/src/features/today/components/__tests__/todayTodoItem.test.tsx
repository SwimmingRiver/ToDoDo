import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayTodoItem from '../todayTodoItem'
import type { Todo } from '@/features/todo/types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
  title: '테스트 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const renderWithRouter = (component: React.ReactElement) =>
  render(<MemoryRouter>{component}</MemoryRouter>)

describe('TodayTodoItem 컴포넌트', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recurrenceId가 있으면 반복 배지가 표시되어야 한다', () => {
    const recurringTodo = makeTodo({
      recurrenceId: 'series-1',
      recurrence: { type: 'daily', endType: 'indefinite' },
    })
    renderWithRouter(<TodayTodoItem todo={recurringTodo} onToggleDone={vi.fn()} />)

    expect(screen.getByLabelText('반복 할 일')).toBeInTheDocument()
  })

  it('recurrenceId가 null이면 반복 배지가 표시되지 않아야 한다', () => {
    const nonRecurringTodo = makeTodo({ recurrenceId: null })
    renderWithRouter(<TodayTodoItem todo={nonRecurringTodo} onToggleDone={vi.fn()} />)

    expect(screen.queryByLabelText('반복 할 일')).not.toBeInTheDocument()
  })

  it('제목과 완료 체크박스, overdue 배지가 정상적으로 렌더링되어야 한다', () => {
    const overdueTodo = makeTodo({
      title: '기한 초과 할 일',
      dueAt: '2026-06-12', // 2일 전 마감
    })
    renderWithRouter(<TodayTodoItem todo={overdueTodo} onToggleDone={vi.fn()} />)

    expect(screen.getByText('기한 초과 할 일')).toBeInTheDocument()
    expect(screen.getByText('2일 초과')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '기한 초과 할 일 완료 처리' })).toBeInTheDocument()
  })

  describe('마감 시각·남은 시간 표시', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 5, 15, 12, 0))
    })

    const dueAt = (d: number, h: number, mi = 0, s = 0) =>
      new Date(2026, 5, d, h, mi, s).toISOString()

    it('오늘 마감이면 남은 시간을 보여 준다', () => {
      renderWithRouter(<TodayTodoItem todo={makeTodo({ dueAt: dueAt(15, 15) })} onToggleDone={vi.fn()} />)
      expect(screen.getByText('3시간 남음')).toBeInTheDocument()
    })

    it('내일 마감이면 D-1에 시각을 붙인다', () => {
      renderWithRouter(<TodayTodoItem todo={makeTodo({ dueAt: dueAt(16, 14, 30) })} onToggleDone={vi.fn()} />)
      expect(screen.getByText('D-1 · 14:30')).toBeInTheDocument()
    })

    it('4일 이상 남으면 24시간제 시각만 보여 준다', () => {
      renderWithRouter(<TodayTodoItem todo={makeTodo({ dueAt: dueAt(21, 9, 5) })} onToggleDone={vi.fn()} />)
      expect(screen.getByText('09:05')).toBeInTheDocument()
    })

    it('화면을 켜 둔 채 마감 시각이 지나면 남음이 지남으로 바뀐다', () => {
      renderWithRouter(<TodayTodoItem todo={makeTodo({ dueAt: dueAt(15, 12, 0, 30) })} onToggleDone={vi.fn()} />)
      expect(screen.getByText('1분 남음')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByText('1분 지남')).toBeInTheDocument()
    })
  })
})

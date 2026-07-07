import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayTodoItem from '../todayTodoItem'
import type { Todo } from '@/features/todo/types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
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
})

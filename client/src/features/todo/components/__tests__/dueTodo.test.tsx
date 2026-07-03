import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DueTodo from '../dueTodo'
import type { Todo } from '../../types/todo.type'

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

describe('DueTodo 컴포넌트', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('"마감 임박" 헤더가 표시되어야 한다', () => {
    renderWithRouter(<DueTodo todos={[]} />)
    expect(screen.getByText('마감 임박')).toBeInTheDocument()
  })

  it('마감 임박 할 일이 없으면 빈 상태 메시지를 표시해야 한다', () => {
    renderWithRouter(<DueTodo todos={[]} />)
    expect(screen.getByText('3일 내 마감 예정이 없습니다')).toBeInTheDocument()
  })

  it('완료된 할 일은 마감 임박 목록에 표시되지 않아야 한다', () => {
    const doneTodo = makeTodo({
      id: 'done-todo',
      title: '완료된 할 일',
      status: 'done',
      dueAt: '2026-06-14', // 오늘 마감
    })
    renderWithRouter(<DueTodo todos={[doneTodo]} />)

    expect(screen.queryByText('완료된 할 일')).not.toBeInTheDocument()
    expect(screen.getByText('3일 내 마감 예정이 없습니다')).toBeInTheDocument()
  })

  it('3일 이내 마감 할 일이 표시되어야 한다', () => {
    const urgentTodo = makeTodo({
      id: 'urgent-todo',
      title: '긴급 할 일',
      status: 'todo',
      dueAt: '2026-06-16', // 2일 후 마감
    })
    renderWithRouter(<DueTodo todos={[urgentTodo]} />)

    expect(screen.getByText('긴급 할 일')).toBeInTheDocument()
  })

  it('오늘 마감 할 일에 "D-day" 배지가 표시되어야 한다', () => {
    const todayTodo = makeTodo({
      id: 'today-todo',
      title: '오늘 마감',
      status: 'todo',
      dueAt: '2026-06-14', // 로컬 날짜 기준 오늘
    })
    renderWithRouter(<DueTodo todos={[todayTodo]} />)

    expect(screen.getByText('D-day')).toBeInTheDocument()
  })

  it('기한이 지난 할 일에 "N일 초과" 배지가 표시되어야 한다', () => {
    const overdueTodo = makeTodo({
      id: 'overdue-todo',
      title: '기한 초과 할 일',
      status: 'todo',
      dueAt: '2026-06-12', // 2일 전 마감
    })
    renderWithRouter(<DueTodo todos={[overdueTodo]} />)

    expect(screen.getByText('기한 초과 할 일')).toBeInTheDocument()
    expect(screen.getByText('2일 초과')).toBeInTheDocument()
  })

  it('4일 후 마감 할 일은 목록에 표시되지 않아야 한다', () => {
    const farTodo = makeTodo({
      id: 'far-todo',
      title: '먼 미래 할 일',
      status: 'todo',
      dueAt: '2026-06-18', // 4일 후
    })
    renderWithRouter(<DueTodo todos={[farTodo]} />)

    expect(screen.queryByText('먼 미래 할 일')).not.toBeInTheDocument()
    expect(screen.getByText('3일 내 마감 예정이 없습니다')).toBeInTheDocument()
  })

  it('여러 마감 임박 할 일이 모두 표시되어야 한다', () => {
    const todos = [
      makeTodo({ id: 'todo-1', title: '오늘 마감', dueAt: '2026-06-14' }),
      makeTodo({ id: 'todo-2', title: '내일 마감', dueAt: '2026-06-15' }),
      makeTodo({ id: 'todo-3', title: '4일 후 마감', dueAt: '2026-06-18' }),
    ]
    renderWithRouter(<DueTodo todos={todos} />)

    expect(screen.getByText('오늘 마감')).toBeInTheDocument()
    expect(screen.getByText('내일 마감')).toBeInTheDocument()
    expect(screen.queryByText('4일 후 마감')).not.toBeInTheDocument()
  })
})

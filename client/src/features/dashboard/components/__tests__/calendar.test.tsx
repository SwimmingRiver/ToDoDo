import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Calendar from '../calendar'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
}))

const { mockTodos } = vi.hoisted(() => {
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  const makeTodo = (i: number) => ({
    id: `todo-${i}`,
    userId: 'user-1',
    title: `할 일 ${i}번`,
    status: 'todo' as const,
    priority: 'medium' as const,
    startAt: null,
    dueAt: todayStr,
    doneAt: null,
    parentId: null,
    order: i,
    recurrence: null,
    recurrenceId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  })
  return { mockTodos: [1, 2, 3, 4, 5].map(makeTodo) }
})

vi.mock('@/features/todo', () => ({
  useTodo: () => ({
    useGetTodos: { data: mockTodos, isLoading: false, isError: false },
    useUpdateTodoDueAt: { mutate: vi.fn() },
  }),
  TodoForm: () => null,
}))

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    useToast: () => ({ error: vi.fn(), success: vi.fn() }),
  }
})

const renderCalendar = () =>
  render(
    <MemoryRouter>
      <Calendar />
    </MemoryRouter>,
  )

describe('Calendar 하루 다건 "+N개" 표시', () => {
  beforeAll(() => {
    // jsdom에는 ResizeObserver가 없다
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('하루에 할 일이 많으면 "+N개" more 링크가 표시된다', async () => {
    renderCalendar()
    const moreLink = await screen.findByText(/\+\d+개/)
    expect(moreLink).toBeInTheDocument()
  })

  it('"+N개" 클릭 시 FC 기본 팝오버 대신 바텀시트가 열린다', async () => {
    renderCalendar()
    const moreLink = await screen.findByText(/\+\d+개/)
    fireEvent.click(moreLink)

    // 바텀시트가 열려 그 날짜의 목록 + 추가 버튼이 보인다
    expect(await screen.findByText('이 날짜에 할 일 추가')).toBeInTheDocument()
    expect(screen.getAllByText(/마감:/).length).toBeGreaterThan(0)
    // FullCalendar 기본 팝오버는 열리지 않아야 한다
    expect(document.querySelector('.fc-popover')).toBeNull()
  })
})

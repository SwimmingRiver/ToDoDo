import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from '../todayPage'
import { useTodayTodos } from '../../hooks/useTodayTodos'
import { useTodo } from '@/features/todo/hooks'
import type { Todo } from '@/features/todo/types/todo.type'
import type { UseTodayTodosResult } from '../../hooks/useTodayTodos'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('../../hooks/useTodayTodos', () => ({
  useTodayTodos: vi.fn(),
}))

vi.mock('@/features/todo/hooks', () => ({
  useTodo: vi.fn(),
}))

vi.mock('@/features/todo/components/todoForm/todoForm', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      <span>할 일 폼</span>
      <button onClick={onClose}>폼 닫기</button>
    </div>
  ),
}))

// TodayItemSkeleton은 접근성 텍스트가 없는 순수 시각적 컴포넌트라
// 로딩 상태를 명확히 식별할 수 있도록 마커로 교체하고, 나머지 shared export는 실제 구현을 사용한다.
vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    TodayItemSkeleton: () => <div>로딩 스켈레톤</div>,
  }
})

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
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
  ...overrides,
})

const makeTodayTodosResult = (
  overrides: Partial<UseTodayTodosResult> = {},
): UseTodayTodosResult => ({
  inProgressTodos: [],
  doneTodos: [],
  doneCount: 0,
  totalCount: 0,
  markers: {},
  isLoading: false,
  isError: false,
  toggleDone: vi.fn(),
  ...overrides,
})

const refetch = vi.fn()

const renderPage = () => render(<MemoryRouter><TodayPage /></MemoryRouter>)

describe('TodayPage 컴포넌트', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 31, 9, 0))
    vi.mocked(useTodo).mockReturnValue({
      useGetTodos: { refetch } as unknown as ReturnType<typeof useTodo>['useGetTodos'],
    } as ReturnType<typeof useTodo>)
    refetch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('로딩 중이면 스켈레톤을 표시하고 목록/빈 상태는 표시하지 않아야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isLoading: true }),
    )

    renderPage()

    expect(screen.getByText('로딩 스켈레톤')).toBeInTheDocument()
    expect(screen.queryByText('오늘 할 일이 없습니다')).not.toBeInTheDocument()
  })

  it('에러 상태이면 에러 안내와 다시 시도 버튼을 표시해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isError: true }),
    )

    renderPage()

    expect(screen.getByText('할 일을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
  })

  it('다시 시도 버튼 클릭 시 refetch가 호출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isError: true }),
    )

    renderPage()
    fireEvent.click(screen.getByText('다시 시도'))

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('할 일이 없으면 빈 상태 안내를 표시해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    expect(screen.getByText('오늘 할 일이 없습니다')).toBeInTheDocument()
    expect(screen.getByText('새 할 일 추가')).toBeInTheDocument()
  })

  it('빈 상태에서 "새 할 일 추가" 클릭 시 할 일 추가 모달이 열려야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByText('새 할 일 추가'))

    expect(screen.getByText('할 일 폼')).toBeInTheDocument()
  })

  it('모달의 닫기 콜백 호출 시 모달이 닫혀야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByText('새 할 일 추가'))
    expect(screen.getByText('할 일 폼')).toBeInTheDocument()

    fireEvent.click(screen.getByText('폼 닫기'))
    expect(screen.queryByText('할 일 폼')).not.toBeInTheDocument()
  })

  it('진행 중인 할 일이 있으면 "진행 중" 섹션에 표시해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '진행 중 할 일' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        totalCount: 1,
      }),
    )

    renderPage()

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('진행 중 할 일')).toBeInTheDocument()
    expect(screen.queryByText('완료')).not.toBeInTheDocument()
  })

  it('완료된 할 일이 있으면 "완료" 섹션에 표시해야 한다', () => {
    const done = makeTodo({ id: 'd1', title: '완료된 할 일', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        doneTodos: [done],
        doneCount: 1,
        totalCount: 1,
      }),
    )

    renderPage()

    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByText('완료된 할 일')).toBeInTheDocument()
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument()
  })

  it('진행 중/완료 할 일이 모두 있으면 두 섹션을 모두 표시해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '진행 중 할 일' })
    const done = makeTodo({ id: 'd1', title: '완료된 할 일', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        doneTodos: [done],
        doneCount: 1,
        totalCount: 2,
      }),
    )

    renderPage()

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('체크박스 클릭 시 toggleDone이 해당 todo와 함께 호출되어야 한다', () => {
    const toggleDone = vi.fn()
    const inProgress = makeTodo({ id: 'p1', title: '체크할 할 일' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        totalCount: 1,
        toggleDone,
      }),
    )

    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: '체크할 할 일 완료 처리' }))

    expect(toggleDone).toHaveBeenCalledWith(inProgress)
  })

  it('완료 진행률(DailyProgress)에 doneCount/totalCount를 전달해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '할 일 A' })
    const done = makeTodo({ id: 'd1', title: '할 일 B', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        doneTodos: [done],
        doneCount: 1,
        totalCount: 2,
      }),
    )

    renderPage()

    expect(screen.getByText('1 / 2 완료')).toBeInTheDocument()
  })

  it('날짜 셀 클릭 시 useTodayTodos가 새로운 selectedDate로 재호출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    // 오늘(2026-07-31) 기준 주간 스트립에서 8/1 셀 클릭
    fireEvent.click(screen.getByLabelText('8월 1일 토요일, 일정 없음'))

    const lastCallArgs = vi.mocked(useTodayTodos).mock.calls.at(-1)
    expect(lastCallArgs?.[0]).toBe('2026-08-01')
  })

  it('다음 버튼 클릭 시 windowStart가 7일 뒤로 이동해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByLabelText('다음 날짜'))

    const lastCallArgs = vi.mocked(useTodayTodos).mock.calls.at(-1)
    expect(lastCallArgs?.[1]).toBe('2026-08-07')
  })
})

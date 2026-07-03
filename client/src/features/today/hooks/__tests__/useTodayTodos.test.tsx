import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodayTodos } from '../useTodayTodos'
import type { Todo } from '@/features/todo/types/todo.type'

// Firebase 모킹
vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

// todoApi 모킹
vi.mock('@/features/todo/api', () => ({
  getTodos: vi.fn(),
  getTodoDetail: vi.fn(),
  createTodo: vi.fn(),
  editTodo: vi.fn(),
  deleteTodo: vi.fn(),
  updateToDone: vi.fn(),
  createChildTodo: vi.fn(),
}))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return Wrapper
}

// 로컬 타임존 기준 2026-06-15(월) 특정 시각의 ISO 문자열 생성
const localISO = (y: number, m: number, d: number, h = 9, min = 0): string =>
  new Date(y, m - 1, d, h, min).toISOString()

describe('useTodayTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // waitFor가 내부적으로 실제 타이머에 의존하므로 shouldAdvanceTime으로
    // 가짜 타이머와 호환시킨다. 2026-06-15 (월요일) 09:00 기준 고정.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 15, 9, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('selectedDate의 dueAt과 일치하는 todo만 골라 진행중/완료로 분리해야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    const mockTodos: Todo[] = [
      makeTodo({ id: '1', title: '오늘 할 일 1', dueAt: localISO(2026, 6, 15, 14) }),
      makeTodo({
        id: '2',
        title: '오늘 완료된 일',
        status: 'done',
        dueAt: localISO(2026, 6, 15, 10),
        doneAt: localISO(2026, 6, 15, 11),
      }),
      makeTodo({ id: '3', title: '내일 할 일', dueAt: localISO(2026, 6, 16, 9) }),
      makeTodo({ id: '4', title: '마감 없음', dueAt: null }),
    ]
    vi.mocked(getTodos).mockResolvedValue(mockTodos)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.inProgressTodos).toHaveLength(1)
    expect(result.current.inProgressTodos[0].id).toBe('1')
    expect(result.current.doneTodos).toHaveLength(1)
    expect(result.current.doneTodos[0].id).toBe('2')
    expect(result.current.totalCount).toBe(2)
    expect(result.current.doneCount).toBe(1)
  })

  it('완료 목록은 doneAt 기준 내림차순으로 정렬되어야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    const mockTodos: Todo[] = [
      makeTodo({
        id: 'older',
        status: 'done',
        dueAt: localISO(2026, 6, 15, 10),
        doneAt: localISO(2026, 6, 15, 9),
      }),
      makeTodo({
        id: 'newer',
        status: 'done',
        dueAt: localISO(2026, 6, 15, 10),
        doneAt: localISO(2026, 6, 15, 12),
      }),
    ]
    vi.mocked(getTodos).mockResolvedValue(mockTodos)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.doneTodos.map((t) => t.id)).toEqual(['newer', 'older'])
  })

  it('해당 날짜에 todo가 없으면 markers는 "none"이어야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    vi.mocked(getTodos).mockResolvedValue([])

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.markers['2026-06-15']).toBe('none')
    // 일~토 7일 모두 키가 존재해야 한다
    expect(Object.keys(result.current.markers)).toHaveLength(7)
  })

  it('마감일이 있고 초과되지 않았으면 markers는 "normal"이어야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    const mockTodos: Todo[] = [
      makeTodo({ id: '1', dueAt: localISO(2026, 6, 17, 14) }), // 화 다음날(수), 2일 후
    ]
    vi.mocked(getTodos).mockResolvedValue(mockTodos)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.markers['2026-06-17']).toBe('normal')
  })

  it('마감 초과(getDaysLeft <= 0)인 todo가 있으면 markers는 "danger"여야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    const mockTodos: Todo[] = [
      makeTodo({ id: '1', dueAt: localISO(2026, 6, 15, 8) }), // 오늘 08:00, 현재(09:00) 기준 이미 지남
    ]
    vi.mocked(getTodos).mockResolvedValue(mockTodos)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.markers['2026-06-15']).toBe('danger')
  })

  it('마커는 windowStart 기준 7일 범위만 포함해야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    vi.mocked(getTodos).mockResolvedValue([])

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const keys = Object.keys(result.current.markers).sort()
    expect(keys).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
    ])
  })

  it('windowStart와 selectedDate가 다를 때 markers는 windowStart 기준으로 계산되어야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    const mockTodos: Todo[] = [
      makeTodo({ id: '1', dueAt: localISO(2026, 6, 22, 10) }), // 2026-06-22, windowStart 범위 내
      makeTodo({ id: '2', dueAt: localISO(2026, 6, 15, 10) }), // 2026-06-15, selectedDate이지만 windowStart 범위 밖
    ]
    vi.mocked(getTodos).mockResolvedValue(mockTodos)

    const { result } = renderHook(
      () => useTodayTodos('2026-06-15', '2026-06-22'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const keys = Object.keys(result.current.markers).sort()
    // windowStart(2026-06-22)부터 7일: 06-22 ~ 06-28
    expect(keys).toEqual([
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
    ])
    expect(result.current.markers['2026-06-22']).toBe('normal')
    // selectedDate(06-15)는 범위 밖이므로 markers에 없음
    expect(result.current.markers['2026-06-15']).toBeUndefined()
  })

  it('toggleDone 호출 시 미완료 todo를 done으로 변경하고 doneAt을 세팅해야 한다', async () => {
    const { getTodos, editTodo } = await import('@/features/todo/api')
    const todo = makeTodo({ id: '1', status: 'todo', dueAt: localISO(2026, 6, 15, 14) })
    vi.mocked(getTodos).mockResolvedValue([todo])
    vi.mocked(editTodo).mockResolvedValue(todo)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.toggleDone(todo)
    })

    await waitFor(() => {
      expect(vi.mocked(editTodo)).toHaveBeenCalled()
    })

    const [calledTodo] = vi.mocked(editTodo).mock.calls[0]
    expect(calledTodo.status).toBe('done')
    expect(calledTodo.doneAt).not.toBeNull()
  })

  it('toggleDone 호출 시 완료된 todo를 todo로 되돌리고 doneAt을 null로 세팅해야 한다', async () => {
    const { getTodos, editTodo } = await import('@/features/todo/api')
    const todo = makeTodo({
      id: '1',
      status: 'done',
      dueAt: localISO(2026, 6, 15, 14),
      doneAt: localISO(2026, 6, 15, 15),
    })
    vi.mocked(getTodos).mockResolvedValue([todo])
    vi.mocked(editTodo).mockResolvedValue(todo)

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.toggleDone(todo)
    })

    await waitFor(() => {
      expect(vi.mocked(editTodo)).toHaveBeenCalled()
    })

    const [calledTodo] = vi.mocked(editTodo).mock.calls[0]
    expect(calledTodo.status).toBe('todo')
    expect(calledTodo.doneAt).toBeNull()
  })

  it('API 호출 실패 시 isError가 true여야 한다', async () => {
    const { getTodos } = await import('@/features/todo/api')
    vi.mocked(getTodos).mockRejectedValueOnce(new Error('Firestore 오류'))

    const { result } = renderHook(() => useTodayTodos('2026-06-15', '2026-06-15'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

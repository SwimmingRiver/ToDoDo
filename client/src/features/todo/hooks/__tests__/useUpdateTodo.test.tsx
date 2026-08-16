import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateTodo } from '../useUpdateTodo'
import { useTodoDetail } from '../useTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock('../../api', () => ({
  editTodo: vi.fn(),
  getTodoDetail: vi.fn(),
  calcParentStatus: vi.fn(() => ({ status: 'todo', doneAt: null })),
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

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useUpdateTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('수정 mutation이 정의되어 있어야 한다', () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const { result } = renderHook(() => useUpdateTodo(), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
  })

  it('수정 성공 시 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { editTodo } = await import('../../api')
    const updatedTodo = makeTodo({ title: '수정된 할 일' })
    vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['todos'], [updatedTodo])
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTodo(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate(updatedTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(editTodo)).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })

  // 회귀 테스트: 상세 페이지(TodoDetail)는 목록과 별도의 쿼리 키
  // ["todoDetail", id]로 데이터를 가져온다(useTodoDetail). onSettled가
  // ["todos"]만 무효화하고 ["todoDetail", id]는 무효화하지 않으면, staleTime
  // 안에 상세를 다시 열었을 때 방금 저장한 값이 반영되지 않는다.
  it('수정 성공 시 todoDetail 쿼리도 무효화해야 한다 (상세 페이지 캐시 동기화)', async () => {
    const { editTodo, getTodoDetail } = await import('../../api')
    const originalTodo = makeTodo({ description: undefined })
    const updatedTodo = makeTodo({ description: '새로 추가한 설명' })

    vi.mocked(getTodoDetail).mockResolvedValueOnce(originalTodo)
    vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)
    vi.mocked(getTodoDetail).mockResolvedValueOnce(updatedTodo)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 60_000 },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['todos'], [originalTodo])

    const { result } = renderHook(
      () => ({
        update: useUpdateTodo(),
        detail: useTodoDetail({ id: 'todo-1' }),
      }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.detail.todo?.id).toBe('todo-1')
    })
    expect(result.current.detail.todo?.description).toBeUndefined()

    result.current.update.mutate(updatedTodo)

    await waitFor(() => {
      expect(result.current.update.isSuccess).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.detail.todo?.description).toBe('새로 추가한 설명')
    })

    expect(vi.mocked(getTodoDetail)).toHaveBeenCalledTimes(2)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useReorderTodos } from '../useReorderTodos'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ reorderTodos: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
  title: '할 일',
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

describe('useReorderTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('성공 시 reorderTodos를 호출하고 todos 쿼리를 무효화해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    vi.mocked(reorderTodos).mockResolvedValueOnce(undefined)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['todos'], [
      makeTodo({ id: 'todo-1', order: 0 }),
      makeTodo({ id: 'todo-2', order: 1 }),
    ])

    const { result } = renderHook(() => useReorderTodos(), {
      wrapper: createWrapper(queryClient),
    })

    const updates = [
      { id: 'todo-1', order: 1 },
      { id: 'todo-2', order: 0 },
    ]
    result.current.mutate(updates)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(reorderTodos)).toHaveBeenCalledWith(updates)
  })

  it('mutate 호출 즉시(서버 응답 전) 캐시에 새 order를 낙관적으로 반영해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    let resolveReorder: () => void = () => {}
    vi.mocked(reorderTodos).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReorder = () => resolve(undefined)
        }),
    )

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    })
    const initialData = [
      makeTodo({ id: 'todo-1', order: 0 }),
      makeTodo({ id: 'todo-2', order: 1 }),
    ]
    queryClient.setQueryData(['todos'], initialData)

    const { result } = renderHook(() => useReorderTodos(), {
      wrapper: createWrapper(queryClient),
    })

    const updates = [
      { id: 'todo-1', order: 1 },
      { id: 'todo-2', order: 0 },
    ]

    await act(async () => {
      result.current.mutate(updates)
    })

    // Check optimistic update while mutation is still pending (before resolving)
    await waitFor(() => {
      const cached = queryClient.getQueryData<Todo[]>(['todos'])
      expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(1)
      expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(0)
    })

    await act(async () => {
      resolveReorder()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })

  it('실패 시 재정렬 이전 캐시 상태로 롤백해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    vi.mocked(reorderTodos).mockRejectedValueOnce(new Error('네트워크 오류'))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    })
    const initialData = [
      makeTodo({ id: 'todo-1', order: 0 }),
      makeTodo({ id: 'todo-2', order: 1 }),
    ]
    queryClient.setQueryData(['todos'], initialData)

    const { result } = renderHook(() => useReorderTodos(), {
      wrapper: createWrapper(queryClient),
    })

    act(() => {
      result.current.mutate([
        { id: 'todo-1', order: 1 },
        { id: 'todo-2', order: 0 },
      ])
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    const cached = queryClient.getQueryData<Todo[]>(['todos'])
    expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(0)
    expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(1)
  })
})

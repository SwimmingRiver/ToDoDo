import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateRecurringTodo } from '../useCreateRecurringTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createRecurringTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'new-todo',
  userId: 'test-user-id',
  title: '반복 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: { type: 'daily', endType: 'indefinite' },
  recurrenceId: 'series-1',
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useCreateRecurringTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('반복 할 일 생성 성공 시 createRecurringTodo를 호출하고 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { createRecurringTodo } = await import('../../api')
    const newTodo = makeTodo()
    vi.mocked(createRecurringTodo).mockResolvedValueOnce([newTodo])

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateRecurringTodo(), { wrapper: Wrapper })

    result.current.mutate(newTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createRecurringTodo)).toHaveBeenCalledWith(newTodo)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateToDone } from '../useUpdateToDone'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ updateToDone: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
  title: '테스트 할 일',
  status: 'done',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: '2026-08-20T12:31:39.000Z',
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-08-20T12:31:39.000Z',
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

describe('useUpdateToDone 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('완료 처리 mutation이 정의되어 있어야 한다', () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpdateToDone(), { wrapper: Wrapper })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('성공 시 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { updateToDone } = await import('../../api')
    const completedTodo = makeTodo()
    vi.mocked(updateToDone).mockResolvedValueOnce(completedTodo)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateToDone(), { wrapper: Wrapper })

    result.current.mutate('todo-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(updateToDone)).toHaveBeenCalledWith('todo-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })
})

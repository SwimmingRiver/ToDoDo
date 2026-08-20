import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateChildTodo } from '../useCreateChildTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createChildTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'parent-1',
  userId: 'test-user-id',
  title: '부모 할 일',
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
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  queryClient.setQueryData(['todos'], [makeTodo()])
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useCreateChildTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('하위 할 일 생성 mutation이 정의되어 있어야 한다', () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCreateChildTodo(), { wrapper: Wrapper })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('캐시된 전체 목록을 함께 넘겨 createChildTodo를 호출하고 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { createChildTodo } = await import('../../api')
    vi.mocked(createChildTodo).mockResolvedValueOnce(makeTodo({ id: 'child-1', parentId: 'parent-1' }))

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateChildTodo(), { wrapper: Wrapper })

    result.current.mutate({ parentId: 'parent-1', todo: { title: '자식 할 일' } })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createChildTodo)).toHaveBeenCalledWith(
      'parent-1',
      { title: '자식 할 일' },
      [makeTodo()],
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })
})

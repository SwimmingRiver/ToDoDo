import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateTodo } from '../useCreateTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'new-todo',
  userId: 'test-user-id',
  title: '새 할 일',
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
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useCreateTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('할 일 생성 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useCreateTodo(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('할 일 생성 성공 시 createTodo를 호출해야 한다', async () => {
    const { createTodo } = await import('../../api')
    const newTodo = makeTodo()
    vi.mocked(createTodo).mockResolvedValueOnce(newTodo)

    const { result } = renderHook(() => useCreateTodo(), { wrapper: createWrapper() })

    result.current.mutate(newTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createTodo)).toHaveBeenCalledWith(newTodo)
  })
})

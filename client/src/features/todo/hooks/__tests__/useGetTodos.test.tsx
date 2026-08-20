import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGetTodos } from '../useGetTodos'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ getTodos: vi.fn() }))

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
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useGetTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('할 일 목록을 성공적으로 가져와야 한다', async () => {
    const { getTodos } = await import('../../api')
    const mockTodos = [
      makeTodo({ id: 'todo-1', title: '첫 번째 할 일' }),
      makeTodo({ id: 'todo-2', title: '두 번째 할 일', order: 1 }),
    ]
    vi.mocked(getTodos).mockResolvedValueOnce(mockTodos)

    const { result } = renderHook(() => useGetTodos(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].title).toBe('첫 번째 할 일')
  })

  it('API 호출 실패 시 에러 상태를 반환해야 한다', async () => {
    const { getTodos } = await import('../../api')
    vi.mocked(getTodos).mockRejectedValueOnce(new Error('Firestore 오류'))

    const { result } = renderHook(() => useGetTodos(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

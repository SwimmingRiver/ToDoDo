import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodoDetail } from '../useTodoDetail'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ getTodoDetail: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-detail-1',
  userId: 'test-user-id',
  title: '상세 할 일',
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
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useTodoDetail 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('특정 ID의 할 일 상세 정보를 가져와야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    vi.mocked(getTodoDetail).mockResolvedValueOnce(makeTodo())

    const { result } = renderHook(() => useTodoDetail({ id: 'todo-detail-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.todo).toBeDefined()
    })

    expect(result.current.todo?.title).toBe('상세 할 일')
    expect(vi.mocked(getTodoDetail)).toHaveBeenCalledWith('todo-detail-1')
  })

  it('초기 상태에서 todo는 undefined여야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    vi.mocked(getTodoDetail).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useTodoDetail({ id: 'any-id' }), {
      wrapper: createWrapper(),
    })

    expect(result.current.todo).toBeUndefined()
  })
})

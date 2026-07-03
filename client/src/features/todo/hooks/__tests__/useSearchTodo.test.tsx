import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSearchTodo } from '../useSearchTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

vi.mock('../../api', () => ({
  getSearchTodoList: vi.fn(),
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
      queries: { retry: false, gcTime: 0 },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSearchTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('검색어가 비어있으면 쿼리가 비활성화되어야 한다', () => {
    const { result } = renderHook(() => useSearchTodo(''), {
      wrapper: createWrapper(),
    })

    // enabled: false이므로 fetchStatus는 'idle'
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('검색어가 있으면 API를 호출해야 한다', async () => {
    const { getSearchTodoList } = await import('../../api')
    const mockResults = [makeTodo({ id: 'todo-1', title: '회의 준비' })]
    vi.mocked(getSearchTodoList).mockResolvedValueOnce(mockResults)

    const { result } = renderHook(() => useSearchTodo('회의'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].title).toBe('회의 준비')
    expect(vi.mocked(getSearchTodoList)).toHaveBeenCalledWith('회의')
  })

  it('검색 결과가 없으면 빈 배열을 반환해야 한다', async () => {
    const { getSearchTodoList } = await import('../../api')
    vi.mocked(getSearchTodoList).mockResolvedValueOnce([])

    const { result } = renderHook(() => useSearchTodo('존재하지않는검색어'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(0)
  })

  it('API 실패 시 에러 상태를 반환해야 한다', async () => {
    const { getSearchTodoList } = await import('../../api')
    vi.mocked(getSearchTodoList).mockRejectedValueOnce(new Error('검색 오류'))

    const { result } = renderHook(() => useSearchTodo('검색어'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEditRecurringSeries } from '../useEditRecurringSeries'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ editRecurringSeries: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
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
  return Wrapper
}

describe('useEditRecurringSeries 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('수정 성공 시 editRecurringSeries를 호출해야 한다', async () => {
    const { editRecurringSeries } = await import('../../api')
    const seriesTodo = makeTodo()
    vi.mocked(editRecurringSeries).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useEditRecurringSeries(), { wrapper: createWrapper() })

    result.current.mutate(seriesTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(editRecurringSeries)).toHaveBeenCalledWith(seriesTodo)
  })
})

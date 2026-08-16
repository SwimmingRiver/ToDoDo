import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDeleteTodo } from '../useDeleteTodo'

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
  deleteTodo: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return Wrapper
}

describe('useDeleteTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('삭제 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useDeleteTodo(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
  })

  it('삭제 성공 시 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { deleteTodo } = await import('../../api')
    vi.mocked(deleteTodo).mockResolvedValueOnce(undefined)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useDeleteTodo(), { wrapper: Wrapper })

    result.current.mutate('todo-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(deleteTodo)).toHaveBeenCalledWith('todo-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })
})

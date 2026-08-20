import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateTodoDueAt } from '../useUpdateTodoDueAt'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ updateTodoDueAt: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useUpdateTodoDueAt 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('마감일 변경 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useUpdateTodoDueAt(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('id, dueAt, startAt을 그대로 전달해야 한다', async () => {
    const { updateTodoDueAt } = await import('../../api')
    vi.mocked(updateTodoDueAt).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useUpdateTodoDueAt(), { wrapper: createWrapper() })

    result.current.mutate({ id: 'todo-1', dueAt: '2026-08-20T00:00:00.000Z', startAt: null })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(updateTodoDueAt)).toHaveBeenCalledWith(
      'todo-1',
      '2026-08-20T00:00:00.000Z',
      null,
    )
  })
})

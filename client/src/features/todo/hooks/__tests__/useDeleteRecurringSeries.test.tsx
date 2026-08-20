import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDeleteRecurringSeries } from '../useDeleteRecurringSeries'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ deleteRecurringSeries: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useDeleteRecurringSeries 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('삭제 성공 시 deleteRecurringSeries를 호출해야 한다', async () => {
    const { deleteRecurringSeries } = await import('../../api')
    vi.mocked(deleteRecurringSeries).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useDeleteRecurringSeries(), { wrapper: createWrapper() })

    result.current.mutate('series-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(deleteRecurringSeries)).toHaveBeenCalledWith('series-1')
  })
})

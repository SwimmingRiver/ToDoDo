import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { useRunStartupMaintenance } from '../useRunStartupMaintenance'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ runStartupMaintenance: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useRunStartupMaintenance 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('쓴 문서가 있으면 todos 쿼리를 무효화해야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    vi.mocked(runStartupMaintenance).mockResolvedValueOnce(3)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(runStartupMaintenance)).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('쓴 문서가 없으면 todos 쿼리를 무효화하지 않아야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    vi.mocked(runStartupMaintenance).mockResolvedValueOnce(0)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('실패 시 사용자에게는 알리지 않되 콘솔에는 에러를 남겨야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    const error = new Error('permission-denied')
    vi.mocked(runStartupMaintenance).mockRejectedValueOnce(error)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('앱 진입 유지보수 실패'),
      error,
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error)

    consoleErrorSpy.mockRestore()
  })
})

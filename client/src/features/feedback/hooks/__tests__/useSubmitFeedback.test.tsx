import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSubmitFeedback } from '../useSubmitFeedback'

vi.mock('../../api', () => ({ submitFeedback: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useSubmitFeedback 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mutate가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('mutate 호출 시 submitFeedback을 content와 함께 호출하고 성공 상태가 되어야 한다', async () => {
    const { submitFeedback } = await import('../../api')
    vi.mocked(submitFeedback).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate('좋은 앱이에요')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(submitFeedback)).toHaveBeenCalledWith('좋은 앱이에요')
  })

  it('submitFeedback이 실패하면 isError가 true가 되어야 한다', async () => {
    const { submitFeedback } = await import('../../api')
    vi.mocked(submitFeedback).mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate('실패 케이스')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

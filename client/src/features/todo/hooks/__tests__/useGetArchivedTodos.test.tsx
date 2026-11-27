import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGetArchivedTodos, ARCHIVED_TODOS_KEY } from '../useGetArchivedTodos'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ getArchivedTodos: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useGetArchivedTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('쿼리 키는 ["todos"] 밖에 있어야 한다 (할 일 하나 고칠 때마다 보관분을 다시 읽지 않도록)', () => {
    expect(ARCHIVED_TODOS_KEY).toEqual(['archivedTodos'])
  })

  it('enabled가 false면 조회하지 않는다', async () => {
    const { getArchivedTodos } = await import('../../api')
    const { Wrapper } = createWrapper()
    renderHook(() => useGetArchivedTodos(false), { wrapper: Wrapper })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(vi.mocked(getArchivedTodos)).not.toHaveBeenCalled()
  })

  it('enabled면 한 번 조회하고, ["todos"]를 무효화해도 다시 읽지 않는다', async () => {
    const { getArchivedTodos } = await import('../../api')
    vi.mocked(getArchivedTodos).mockResolvedValue([])
    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(() => useGetArchivedTodos(true), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(vi.mocked(getArchivedTodos)).toHaveBeenCalledTimes(1)

    await queryClient.invalidateQueries({ queryKey: ['todos'] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(vi.mocked(getArchivedTodos)).toHaveBeenCalledTimes(1)
  })
})

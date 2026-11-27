import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGetArchivedTodos, ARCHIVED_TODOS_KEY } from '../useGetArchivedTodos'

const authMock = vi.hoisted(() => ({
  currentUser: { uid: 'test-user-id' } as { uid: string } | null,
}))
vi.mock('@/shared/lib/firebase', () => ({
  auth: authMock,
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
    authMock.currentUser = { uid: 'test-user-id' }
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

  it('같은 탭에서 다른 계정으로 바뀌면 이전 사용자의 캐시를 쓰지 않고 새로 읽는다', async () => {
    const { getArchivedTodos } = await import('../../api')
    vi.mocked(getArchivedTodos)
      .mockResolvedValueOnce([{ id: 'a-archived' }] as never)
      .mockResolvedValueOnce([{ id: 'b-archived' }] as never)
    const { Wrapper } = createWrapper()

    const { result, rerender } = renderHook(() => useGetArchivedTodos(true), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('a-archived'))

    // A 로그아웃 → B 로그인(새로고침 없음, 쿼리 캐시는 그대로)
    authMock.currentUser = { uid: 'other-user-id' }
    rerender()

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('b-archived'))
    expect(vi.mocked(getArchivedTodos)).toHaveBeenCalledTimes(2)
  })

  it('로그인한 사용자가 없으면 조회하지 않는다', async () => {
    const { getArchivedTodos } = await import('../../api')
    authMock.currentUser = null
    const { Wrapper } = createWrapper()
    renderHook(() => useGetArchivedTodos(true), { wrapper: Wrapper })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(vi.mocked(getArchivedTodos)).not.toHaveBeenCalled()
  })

  it('ARCHIVED_TODOS_KEY로 무효화하면 사용자별 키도 앞부분 일치로 다시 읽는다', async () => {
    const { getArchivedTodos } = await import('../../api')
    vi.mocked(getArchivedTodos).mockResolvedValue([])
    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(() => useGetArchivedTodos(true), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await queryClient.invalidateQueries({ queryKey: ARCHIVED_TODOS_KEY })
    await waitFor(() => expect(vi.mocked(getArchivedTodos)).toHaveBeenCalledTimes(2))
  })
})

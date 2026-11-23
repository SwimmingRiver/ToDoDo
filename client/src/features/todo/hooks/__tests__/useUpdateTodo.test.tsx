import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateTodo } from '../useUpdateTodo'
import { useTodoDetail } from '../useTodoDetail'
import type { Todo } from '../../types/todo.type'

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
  editTodo: vi.fn(),
  getTodoDetail: vi.fn(),
  calcParentStatus: vi.fn(() => ({ status: 'todo', doneAt: null })),
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

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useUpdateTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('수정 mutation이 정의되어 있어야 한다', () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const { result } = renderHook(() => useUpdateTodo(), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current).toBeDefined()
    expect(typeof result.current.mutate).toBe('function')
  })

  it('수정 성공 시 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { editTodo } = await import('../../api')
    const updatedTodo = makeTodo({ title: '수정된 할 일' })
    vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['todos'], [updatedTodo])
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTodo(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate(updatedTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(editTodo)).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })

  // 회귀 테스트: 상세 페이지(TodoDetail)는 목록과 별도의 쿼리 키
  // ["todoDetail", id]로 데이터를 가져온다(useTodoDetail). onSettled가
  // ["todos"]만 무효화하고 ["todoDetail", id]는 무효화하지 않으면, staleTime
  // 안에 상세를 다시 열었을 때 방금 저장한 값이 반영되지 않는다.
  it('수정 성공 시 todoDetail 쿼리도 무효화해야 한다 (상세 페이지 캐시 동기화)', async () => {
    const { editTodo, getTodoDetail } = await import('../../api')
    const originalTodo = makeTodo({ description: undefined })
    const updatedTodo = makeTodo({ description: '새로 추가한 설명' })

    vi.mocked(getTodoDetail).mockResolvedValueOnce(originalTodo)
    vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)
    vi.mocked(getTodoDetail).mockResolvedValueOnce(updatedTodo)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 60_000 },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['todos'], [originalTodo])

    const { result } = renderHook(
      () => ({
        update: useUpdateTodo(),
        detail: useTodoDetail({ id: 'todo-1' }),
      }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.detail.todo?.id).toBe('todo-1')
    })
    expect(result.current.detail.todo?.description).toBeUndefined()

    result.current.update.mutate(updatedTodo)

    await waitFor(() => {
      expect(result.current.update.isSuccess).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.detail.todo?.description).toBe('새로 추가한 설명')
    })

    expect(vi.mocked(getTodoDetail)).toHaveBeenCalledTimes(2)
  })
  // 저장 응답 전에 보이는 캐시도 editTodo와 같은 완료 시각 규칙(resolveDoneAt)을 따른다.
  describe('낙관적 업데이트의 doneAt', () => {
    const NOW = new Date('2030-01-15T03:00:00.000Z')
    const EARLIER = '2030-01-01T00:00:00.000Z'

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const runOptimistic = async (cache: Todo[], update: Todo) => {
      const { editTodo } = await import('../../api')
      // 저장이 끝나지 않은 상태에서 캐시를 본다
      vi.mocked(editTodo).mockReturnValueOnce(new Promise(() => {}))
      const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      queryClient.setQueryData(['todos'], cache)
      const { result } = renderHook(() => useUpdateTodo(), { wrapper: createWrapper(queryClient) })
      result.current.mutate(update)
      await waitFor(() => expect(vi.mocked(editTodo)).toHaveBeenCalled())
      const byId = (id: string) => queryClient.getQueryData<Todo[]>(['todos'])?.find((t) => t.id === id)
      return byId
    }

    it('status만 done으로 넘겨도 캐시에 지금 시각을 채운다', async () => {
      const todo = makeTodo({ status: 'doing' })
      const byId = await runOptimistic([todo], { ...todo, status: 'done' })
      expect(byId('todo-1')?.doneAt).toBe(NOW.toISOString())
    })

    it('이미 완료된 할 일은 처음 완료 시각을 유지하고, 완료 취소는 지운다', async () => {
      const done = makeTodo({ status: 'done', doneAt: EARLIER })
      let byId = await runOptimistic([done], { ...done, doneAt: null, title: '수정' })
      expect(byId('todo-1')?.doneAt).toBe(EARLIER)

      byId = await runOptimistic([done], { ...done, status: 'todo' })
      expect(byId('todo-1')?.doneAt).toBeNull()
    })

    it('상위 완료 시 이미 완료된 하위의 완료 시각은 덮어쓰지 않는다', async () => {
      const root = makeTodo({ id: 'root-1', status: 'doing' })
      const open = makeTodo({ id: 'c-open', parentId: 'root-1', status: 'todo' })
      const done = makeTodo({ id: 'c-done', parentId: 'root-1', status: 'done', doneAt: EARLIER })
      const byId = await runOptimistic([root, open, done], { ...root, status: 'done' })
      expect(byId('c-open')).toMatchObject({ status: 'done', doneAt: NOW.toISOString() })
      expect(byId('c-done')?.doneAt).toBe(EARLIER)
    })

    it('하위를 고쳐도 상위가 계속 완료면 상위의 완료 시각을 유지한다', async () => {
      const { calcParentStatus } = await import('../../api')
      vi.mocked(calcParentStatus).mockReturnValueOnce({ status: 'done', doneAt: NOW.toISOString() })
      const parent = makeTodo({ id: 'root-1', status: 'done', doneAt: EARLIER })
      const child = makeTodo({ id: 'c-1', parentId: 'root-1', status: 'done', doneAt: EARLIER })
      const byId = await runOptimistic([parent, child], { ...child, title: '수정' })
      expect(byId('root-1')?.doneAt).toBe(EARLIER)
    })
  })
})

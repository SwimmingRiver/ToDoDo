import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodo, useTodoDetail } from '../useTodo'
import type { Todo } from '../../types/todo.type'

// Firebase 모킹
vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

// todoApi 모킹
vi.mock('../../api', () => ({
  getTodos: vi.fn(),
  getTodoDetail: vi.fn(),
  createTodo: vi.fn(),
  editTodo: vi.fn(),
  deleteTodo: vi.fn(),
  updateToDone: vi.fn(),
  updateTodoDueAt: vi.fn(),
  createChildTodo: vi.fn(),
  createRecurringTodo: vi.fn(),
  editRecurringSeries: vi.fn(),
  deleteRecurringSeries: vi.fn(),
  runStartupMaintenance: vi.fn(),
  reorderTodos: vi.fn(),
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
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return Wrapper
}

describe('useTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useGetTodos', () => {
    it('할 일 목록을 성공적으로 가져와야 한다', async () => {
      const { getTodos } = await import('../../api')
      const mockTodos = [
        makeTodo({ id: 'todo-1', title: '첫 번째 할 일' }),
        makeTodo({ id: 'todo-2', title: '두 번째 할 일', order: 1 }),
      ]
      vi.mocked(getTodos).mockResolvedValueOnce(mockTodos)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      expect(result.current.useGetTodos.data).toHaveLength(2)
      expect(result.current.useGetTodos.data?.[0].title).toBe('첫 번째 할 일')
    })

    it('API 호출 실패 시 에러 상태를 반환해야 한다', async () => {
      const { getTodos } = await import('../../api')
      vi.mocked(getTodos).mockRejectedValueOnce(new Error('Firestore 오류'))

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isError).toBe(true)
      })
    })

    it('초기 상태는 로딩 상태여야 한다', async () => {
      const { getTodos } = await import('../../api')
      vi.mocked(getTodos).mockImplementation(
        () => new Promise(() => {}), // 영원히 pending
      )

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useGetTodos.isLoading).toBe(true)
    })
  })

  describe('useCreateTodo', () => {
    it('할 일 생성 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useCreateTodo).toBeDefined()
      expect(typeof result.current.useCreateTodo.mutate).toBe('function')
    })

    it('할 일 생성 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, createTodo } = await import('../../api')
      const newTodo = makeTodo({ id: 'new-todo', title: '새 할 일' })

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(createTodo).mockResolvedValueOnce(newTodo)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useCreateTodo.mutate(newTodo)

      await waitFor(() => {
        expect(result.current.useCreateTodo.isSuccess).toBe(true)
      })

      expect(vi.mocked(createTodo)).toHaveBeenCalledWith(newTodo)
    })
  })

  describe('useUpdateTodo', () => {
    it('할 일 수정 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useUpdateTodo).toBeDefined()
      expect(typeof result.current.useUpdateTodo.mutate).toBe('function')
    })

    it('수정 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, editTodo } = await import('../../api')
      const updatedTodo = makeTodo({ id: 'todo-1', title: '수정된 할 일' })

      vi.mocked(getTodos).mockResolvedValue([updatedTodo])
      vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useUpdateTodo.mutate(updatedTodo)

      await waitFor(() => {
        expect(result.current.useUpdateTodo.isSuccess).toBe(true)
      })

      expect(vi.mocked(editTodo)).toHaveBeenCalled()
    })

    // 회귀 테스트: 상세 페이지(TodoDetail)는 목록과 별도의 쿼리 키
    // ["todoDetail", id]로 데이터를 가져온다(useTodoDetail). useUpdateTodo의
    // onSettled는 지금까지 ["todos"]만 무효화하고 ["todoDetail", id]는 무효화하지
    // 않았다 — main.tsx의 QueryClient가 staleTime: 60_000(1분)으로 설정되어 있어서,
    // 상세 페이지에서 description을 수정 저장한 뒤 1분 안에 같은 할 일 상세를 다시
    // 열면 무효화되지 않은 캐시가 "신선하다"고 판단되어 재조회 없이 그대로 재사용된다.
    // 그 결과 방금 저장한 description이 화면에 반영되지 않아 "설명이 표시되지 않는다"는
    // 버그로 보인다(실제로는 저장은 됐으나 상세 캐시만 갱신되지 않은 것).
    it('수정 성공 시 todoDetail 쿼리도 무효화해야 한다 (상세 페이지 캐시 동기화)', async () => {
      const { getTodos, getTodoDetail, editTodo } = await import('../../api')
      const originalTodo = makeTodo({ id: 'todo-1', title: '할 일', description: undefined })
      const updatedTodo = makeTodo({ id: 'todo-1', title: '할 일', description: '새로 추가한 설명' })

      vi.mocked(getTodos).mockResolvedValue([originalTodo])
      vi.mocked(getTodoDetail).mockResolvedValueOnce(originalTodo)
      vi.mocked(editTodo).mockResolvedValueOnce(updatedTodo)
      // 무효화로 인한 자동 재조회가 일어난다면 이 두 번째 응답을 받아야 한다.
      vi.mocked(getTodoDetail).mockResolvedValueOnce(updatedTodo)

      const queryClient = new QueryClient({
        defaultOptions: {
          // main.tsx의 실제 프로덕션 설정과 동일하게 staleTime을 1분으로 재현한다.
          // 이 값이 없으면(테스트 기본값 staleTime: 0) 마운트마다 항상 재조회가
          // 일어나 버그가 재현되지 않는다.
          queries: { retry: false, gcTime: 0, staleTime: 60_000 },
          mutations: { retry: false },
        },
      })
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      // 실제 앱처럼 useTodo()(useUpdateTodo)와 useTodoDetail()이 같은
      // QueryClient를 공유하는 상황을 재현한다.
      const { result } = renderHook(
        () => ({ todo: useTodo(), detail: useTodoDetail({ id: 'todo-1' }) }),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.detail.todo?.id).toBe('todo-1')
      })
      expect(result.current.detail.todo?.description).toBeUndefined()

      result.current.todo.useUpdateTodo.mutate(updatedTodo)

      await waitFor(() => {
        expect(result.current.todo.useUpdateTodo.isSuccess).toBe(true)
      })

      // todoDetail 쿼리가 무효화되어(staleTime 안에 있더라도) active 쿼리이므로
      // 자동으로 재조회되고, 화면에 새 description이 반영되어야 한다. 무효화가
      // 빠져 있으면 캐시된 옛 값(undefined)이 계속 유지되어 이 assertion이 실패한다.
      await waitFor(() => {
        expect(result.current.detail.todo?.description).toBe('새로 추가한 설명')
      })

      const state = queryClient.getQueryState(['todoDetail', 'todo-1'])
      expect(state?.isInvalidated).toBe(false)
      expect(vi.mocked(getTodoDetail)).toHaveBeenCalledTimes(2)
    })
  })

  describe('useDeleteTodo', () => {
    it('할 일 삭제 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useDeleteTodo).toBeDefined()
      expect(typeof result.current.useDeleteTodo.mutate).toBe('function')
    })

    it('삭제 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, deleteTodo } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(deleteTodo).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useDeleteTodo.mutate('todo-1')

      await waitFor(() => {
        expect(result.current.useDeleteTodo.isSuccess).toBe(true)
      })

      expect(vi.mocked(deleteTodo)).toHaveBeenCalledWith('todo-1')
    })
  })

  describe('useUpdateToDone', () => {
    it('완료 처리 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useUpdateToDone).toBeDefined()
      expect(typeof result.current.useUpdateToDone.mutate).toBe('function')
    })
  })

  describe('useCreateChildTodo', () => {
    it('하위 할 일 생성 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useCreateChildTodo).toBeDefined()
      expect(typeof result.current.useCreateChildTodo.mutate).toBe('function')
    })
  })

  describe('useCreateRecurringTodo', () => {
    it('반복 할 일 생성 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useCreateRecurringTodo).toBeDefined()
      expect(typeof result.current.useCreateRecurringTodo.mutate).toBe('function')
    })

    it('생성 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, createRecurringTodo } = await import('../../api')
      const newTodo = makeTodo({ id: 'new-todo', title: '반복 할 일', recurrence: { type: 'daily', endType: 'indefinite' }, recurrenceId: 'series-1' })

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(createRecurringTodo).mockResolvedValueOnce([newTodo])

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useCreateRecurringTodo.mutate(newTodo)

      await waitFor(() => {
        expect(result.current.useCreateRecurringTodo.isSuccess).toBe(true)
      })

      expect(vi.mocked(createRecurringTodo)).toHaveBeenCalledWith(newTodo)
    })
  })

  describe('useEditRecurringSeries', () => {
    it('반복 시리즈 수정 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useEditRecurringSeries).toBeDefined()
      expect(typeof result.current.useEditRecurringSeries.mutate).toBe('function')
    })

    it('수정 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, editRecurringSeries } = await import('../../api')
      const seriesTodo = makeTodo({ id: 'todo-1', recurrence: { type: 'daily', endType: 'indefinite' }, recurrenceId: 'series-1' })

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(editRecurringSeries).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useEditRecurringSeries.mutate(seriesTodo)

      await waitFor(() => {
        expect(result.current.useEditRecurringSeries.isSuccess).toBe(true)
      })

      expect(vi.mocked(editRecurringSeries)).toHaveBeenCalledWith(seriesTodo)
    })
  })

  describe('useDeleteRecurringSeries', () => {
    it('반복 시리즈 삭제 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useDeleteRecurringSeries).toBeDefined()
      expect(typeof result.current.useDeleteRecurringSeries.mutate).toBe('function')
    })

    it('삭제 성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, deleteRecurringSeries } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(deleteRecurringSeries).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useDeleteRecurringSeries.mutate('series-1')

      await waitFor(() => {
        expect(result.current.useDeleteRecurringSeries.isSuccess).toBe(true)
      })

      expect(vi.mocked(deleteRecurringSeries)).toHaveBeenCalledWith('series-1')
    })
  })

  describe('useReorderTodos', () => {
    // onMutate 중간 상태(캐시가 낙관적으로 갱신됐는지)와 onError 롤백을 검증하려면
    // 내부 QueryClient에 직접 접근해야 해서, createWrapper()와 별도로 QueryClient를
    // 함께 반환하는 헬퍼를 이 describe 블록 안에서만 사용한다.
    const createWrapperWithClient = () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
      return { Wrapper, queryClient }
    }

    it('재정렬 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useReorderTodos).toBeDefined()
      expect(typeof result.current.useReorderTodos.mutate).toBe('function')
    })

    it('성공 시 reorderTodos를 호출하고 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, reorderTodos } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([
        makeTodo({ id: 'todo-1', order: 0 }),
        makeTodo({ id: 'todo-2', order: 1 }),
      ])
      vi.mocked(reorderTodos).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      const updates = [
        { id: 'todo-1', order: 1 },
        { id: 'todo-2', order: 0 },
      ]
      result.current.useReorderTodos.mutate(updates)

      await waitFor(() => {
        expect(result.current.useReorderTodos.isSuccess).toBe(true)
      })

      expect(vi.mocked(reorderTodos)).toHaveBeenCalledWith(updates)
    })

    it('mutate 호출 즉시(서버 응답 전) 캐시에 새 order를 낙관적으로 반영해야 한다', async () => {
      const { getTodos, reorderTodos } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([
        makeTodo({ id: 'todo-1', order: 0 }),
        makeTodo({ id: 'todo-2', order: 1 }),
      ])

      // 서버 응답을 인위적으로 지연시켜, 응답 전 캐시 상태(낙관적 갱신 결과)를 검증한다.
      let resolveReorder: () => void = () => {}
      vi.mocked(reorderTodos).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReorder = () => resolve(undefined)
          }),
      )

      const { Wrapper, queryClient } = createWrapperWithClient()
      const { result } = renderHook(() => useTodo(), { wrapper: Wrapper })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useReorderTodos.mutate([
        { id: 'todo-1', order: 1 },
        { id: 'todo-2', order: 0 },
      ])

      await waitFor(() => {
        const cached = queryClient.getQueryData<Todo[]>(['todos'])
        expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(1)
        expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(0)
      })

      resolveReorder()
      await waitFor(() => {
        expect(result.current.useReorderTodos.isSuccess).toBe(true)
      })
    })

    it('실패 시 재정렬 이전 캐시 상태로 롤백해야 한다', async () => {
      const { getTodos, reorderTodos } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([
        makeTodo({ id: 'todo-1', order: 0 }),
        makeTodo({ id: 'todo-2', order: 1 }),
      ])
      vi.mocked(reorderTodos).mockRejectedValueOnce(new Error('네트워크 오류'))

      const { Wrapper, queryClient } = createWrapperWithClient()
      const { result } = renderHook(() => useTodo(), { wrapper: Wrapper })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useReorderTodos.mutate([
        { id: 'todo-1', order: 1 },
        { id: 'todo-2', order: 0 },
      ])

      await waitFor(() => {
        expect(result.current.useReorderTodos.isError).toBe(true)
      })

      const cached = queryClient.getQueryData<Todo[]>(['todos'])
      expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(0)
      expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(1)
    })
  })

  describe('useRunStartupMaintenance', () => {
    it('앱 진입 유지보수 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useRunStartupMaintenance).toBeDefined()
      expect(typeof result.current.useRunStartupMaintenance.mutate).toBe('function')
    })

    it('쓴 문서가 있으면 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, runStartupMaintenance } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(runStartupMaintenance).mockResolvedValueOnce(3)

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const { result } = renderHook(() => useTodo(), { wrapper })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })
      invalidateSpy.mockClear()

      result.current.useRunStartupMaintenance.mutate()

      await waitFor(() => {
        expect(result.current.useRunStartupMaintenance.isSuccess).toBe(true)
      })

      expect(vi.mocked(runStartupMaintenance)).toHaveBeenCalled()
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    })

    // 이 refactor의 핵심 목적: 세 정책 모두 대부분의 실행에서 쓸 것이 없는데 무조건
    // 무효화하면 하는 일 없이 getTodos() 전체 재조회를 유발한다.
    it('쓴 문서가 없으면 todos 쿼리를 무효화하지 않아야 한다', async () => {
      const { getTodos, runStartupMaintenance } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(runStartupMaintenance).mockResolvedValueOnce(0)

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const { result } = renderHook(() => useTodo(), { wrapper })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })
      invalidateSpy.mockClear()

      result.current.useRunStartupMaintenance.mutate()

      await waitFor(() => {
        expect(result.current.useRunStartupMaintenance.isSuccess).toBe(true)
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('실패 시 사용자에게는 알리지 않되 콘솔에는 에러를 남겨야 한다', async () => {
      const { getTodos, runStartupMaintenance } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      const error = new Error('permission-denied')
      vi.mocked(runStartupMaintenance).mockRejectedValueOnce(error)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useRunStartupMaintenance.mutate()

      await waitFor(() => {
        expect(result.current.useRunStartupMaintenance.isError).toBe(true)
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('앱 진입 유지보수 실패'),
        error,
      )

      consoleErrorSpy.mockRestore()
    })
  })
})

describe('useTodoDetail 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('특정 ID의 할 일 상세 정보를 가져와야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    const mockTodo = makeTodo({ id: 'todo-detail-1', title: '상세 할 일' })
    vi.mocked(getTodoDetail).mockResolvedValueOnce(mockTodo)

    const { result } = renderHook(() => useTodoDetail({ id: 'todo-detail-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.todo).toBeDefined()
    })

    expect(result.current.todo?.title).toBe('상세 할 일')
    expect(vi.mocked(getTodoDetail)).toHaveBeenCalledWith('todo-detail-1')
  })

  it('초기 상태에서 todo는 undefined여야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    vi.mocked(getTodoDetail).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useTodoDetail({ id: 'any-id' }), {
      wrapper: createWrapper(),
    })

    expect(result.current.todo).toBeUndefined()
  })
})

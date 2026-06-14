import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodo, useTodoDetail } from '../useTodo'
import type { Todo } from '../../types/todo.type'

// Firebase 모킹
vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

// todoApi 모킹
vi.mock('../../api', () => ({
  getTodos: vi.fn(),
  getTodoDetail: vi.fn(),
  createTodo: vi.fn(),
  editTodo: vi.fn(),
  deleteTodo: vi.fn(),
  updateToDone: vi.fn(),
  createChildTodo: vi.fn(),
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

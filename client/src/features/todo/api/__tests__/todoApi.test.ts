import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Todo } from '../../types/todo.type'

// Firebase 모킹 - 실제 Firebase에 연결하지 않도록 처리
vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  googleProvider: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
}))

// 테스트용 Todo 팩토리
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

describe('todoApi', () => {
  describe('getTodos', () => {
    it('인증된 사용자의 할 일 목록을 order 순으로 정렬해서 반환해야 한다', async () => {
      const { getDocs, query, where } = await import('firebase/firestore')
      const { getTodos } = await import('../todoApi')

      const mockDocs = [
        { id: 'todo-2', data: () => ({ ...makeTodo({ id: 'todo-2', order: 1 }), id: undefined }) },
        { id: 'todo-1', data: () => ({ ...makeTodo({ id: 'todo-1', order: 0 }), id: undefined }) },
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockDocs,
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)

      const result = await getTodos()

      expect(result[0].order).toBe(0)
      expect(result[1].order).toBe(1)
    })

    it('인증되지 않은 경우 에러를 던져야 한다', async () => {
      const firebase = await import('@/shared/lib/firebase')
      Object.defineProperty(firebase.auth, 'currentUser', { value: null, configurable: true })

      const { getTodos } = await import('../todoApi')

      await expect(getTodos()).rejects.toThrow('Not authenticated')

      // 복원
      Object.defineProperty(firebase.auth, 'currentUser', { value: { uid: 'test-user-id' }, configurable: true })
    })
  })

  describe('getSearchTodoList', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      // auth.currentUser가 설정되어 있는지 확인 (vi.mock에서 이미 설정됨)
      if (!firebase.auth.currentUser) {
        Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
      }
    })

    it('검색어와 일치하는 할 일만 반환해야 한다', async () => {
      const { getDocs } = await import('firebase/firestore')
      const { getSearchTodoList } = await import('../todoApi')

      const mockTodos = [
        makeTodo({ id: 'todo-1', title: '회의 준비' }),
        makeTodo({ id: 'todo-2', title: '장 보기' }),
        makeTodo({ id: 'todo-3', title: '회의록 작성' }),
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockTodos.map((t) => ({
          id: t.id,
          data: () => { const { id: _, ...rest } = t; return rest },
        })),
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)

      const result = await getSearchTodoList('회의')

      expect(result).toHaveLength(2)
      expect(result.map((t) => t.title)).toContain('회의 준비')
      expect(result.map((t) => t.title)).toContain('회의록 작성')
    })

    it('검색어가 대소문자 구분 없이 동작해야 한다', async () => {
      const { getDocs } = await import('firebase/firestore')
      const { getSearchTodoList } = await import('../todoApi')

      const mockTodos = [
        makeTodo({ id: 'todo-1', title: 'React 공부' }),
        makeTodo({ id: 'todo-2', title: 'react 버전 업데이트' }),
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockTodos.map((t) => ({
          id: t.id,
          data: () => { const { id: _, ...rest } = t; return rest },
        })),
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)

      const result = await getSearchTodoList('react')

      expect(result).toHaveLength(2)
    })
  })
})

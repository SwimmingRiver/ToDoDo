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
  writeBatch: vi.fn(),
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
  recurrence: null,
  recurrenceId: null,
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

    it('archived: true인 문서는 결과에서 제외해야 한다', async () => {
      const { getDocs, query, where } = await import('firebase/firestore')
      const { getTodos } = await import('../todoApi')

      const mockDocs = [
        { id: 'active-1', data: () => ({ ...makeTodo({ order: 0 }), id: undefined, archived: false }) },
        { id: 'archived-1', data: () => ({ ...makeTodo({ order: 1, status: 'done' }), id: undefined, archived: true }) },
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockDocs,
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)

      await getTodos()

      // getTodos는 archived 필터링을 클라이언트가 아니라 Firestore 쿼리 조건으로 위임한다
      // (where("archived","==",false)) — mock에서는 Firestore가 실제로 필터링하지 않으므로
      // "쿼리에 그 조건이 들어갔는지"를 검증한다.
      expect(where).toHaveBeenCalledWith('archived', '==', false)
    })

    it('order 필드가 없는(undefined) 레거시 문서가 섞여 있어도 나머지 문서는 정상적으로 order 순 정렬되어야 한다', async () => {
      // 비교 함수가 undefined - number = NaN을 반환하면 정렬 전체가 깨지는 회귀
      // 버그가 있었다(order가 있는 문서끼리도 전혀 정렬되지 않음).
      const { getDocs, query, where } = await import('firebase/firestore')
      const { getTodos } = await import('../todoApi')

      const legacyDone = { ...makeTodo({ title: '레거시', status: 'done' }), id: undefined, order: undefined }
      const mockDocs = [
        { id: 'todo-3', data: () => ({ ...makeTodo({ title: '셋', order: 2 }), id: undefined }) },
        { id: 'legacy-done', data: () => legacyDone },
        { id: 'todo-1', data: () => ({ ...makeTodo({ title: '하나', order: 0 }), id: undefined }) },
        { id: 'todo-2', data: () => ({ ...makeTodo({ title: '둘', order: 1 }), id: undefined }) },
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockDocs,
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)

      const result = await getTodos()

      expect(result.map((t) => t.title)).toEqual(['하나', '둘', '셋', '레거시'])
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

  describe('createTodo', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
    })

    it('생성한 문서에 archived: false를 명시적으로 채워야 한다', async () => {
      const { getDocs, addDoc, query, where } = await import('firebase/firestore')
      const { createTodo } = await import('../todoApi')

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [],
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)
      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'new-1' } as Awaited<ReturnType<typeof addDoc>>)

      await createTodo(makeTodo({ title: '새 할일' }))

      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archived: false }),
      )
    })
  })

  describe('createChildTodo', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
    })

    it('생성한 하위 할 일에 archived: false를 명시적으로 채워야 한다', async () => {
      const { addDoc, updateDoc } = await import('firebase/firestore')
      const { createChildTodo } = await import('../todoApi')

      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'child-1' } as Awaited<ReturnType<typeof addDoc>>)
      vi.mocked(updateDoc).mockResolvedValueOnce(undefined)

      await createChildTodo('parent-1', { title: '하위 할일' }, [])

      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archived: false }),
      )
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

  describe('reorderTodos', () => {
    const makeBatch = () => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })

    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
    })

    it('전달받은 id/order 쌍마다 batch.update를 호출하고 한 번에 commit해야 한다', async () => {
      const { doc, writeBatch } = await import('firebase/firestore')
      const { reorderTodos } = await import('../todoApi')

      const batch = makeBatch()
      vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>)
      vi.mocked(doc).mockImplementation((...args: unknown[]) => ({ id: args[2] }) as ReturnType<typeof doc>)

      await reorderTodos([
        { id: 'todo-1', order: 0 },
        { id: 'todo-2', order: 1 },
      ])

      expect(batch.update).toHaveBeenCalledTimes(2)
      expect(batch.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'todo-1' }),
        expect.objectContaining({ order: 0 }),
      )
      expect(batch.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'todo-2' }),
        expect.objectContaining({ order: 1 }),
      )
      expect(batch.commit).toHaveBeenCalledTimes(1)
    })

    it('빈 배열이 전달되면 batch를 생성하지 않고 아무 것도 쓰지 않아야 한다', async () => {
      const { writeBatch } = await import('firebase/firestore')
      const { reorderTodos } = await import('../todoApi')

      await reorderTodos([])

      expect(writeBatch).not.toHaveBeenCalled()
    })

    it('인증되지 않은 경우 에러를 던져야 한다', async () => {
      const firebase = await import('@/shared/lib/firebase')
      Object.defineProperty(firebase.auth, 'currentUser', { value: null, configurable: true })

      const { reorderTodos } = await import('../todoApi')

      await expect(reorderTodos([{ id: 'todo-1', order: 0 }])).rejects.toThrow('Not authenticated')

      Object.defineProperty(firebase.auth, 'currentUser', { value: { uid: 'test-user-id' }, configurable: true })
    })
  })
})

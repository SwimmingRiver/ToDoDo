import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDocs } from 'firebase/firestore'
import { ToastProvider } from '@/shared/ui/toast/toastContext'
import { setupUser } from '@/test/setupUser'
import TodoList from '../todoList'
import type { Todo } from '../../types/todo.type'

vi.mock('@/features/aiPlan/components/aiPlanModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="AI로 계획">
      <button onClick={onClose}>stub 닫기</button>
    </div>
  ),
}))

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

// Firestore 읽기 횟수를 세는 지점. 검색·필터가 읽기를 늘리지 않는지 여기서 본다.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}))

// 삭제 mutation만 스텁하고 나머지 훅(URL 필터 등)은 실제 구현을 쓴다.
vi.mock('../../hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks')>()),
  useDeleteTodo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRecurringSeries: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Modal을 열었을 때(새 프로젝트 추가) TodoForm까지 렌더되면 그 자체의 훅 의존성이
// 딸려오므로, 이 테스트가 보려는 것(부모 리렌더 시 ProjectCard로 내려가는 핸들러
// prop의 참조 안정성)과 무관한 실패 지점을 늘린다. 최소 스텁으로 대체한다.
vi.mock('../todoForm/todoForm', () => ({
  default: () => null,
}))

const projectCardCalls: Array<Record<string, unknown>> = []
vi.mock('../projectCard', () => ({
  default: (props: Record<string, unknown>) => {
    projectCardCalls.push(props)
    return null
  },
}))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
  title: '프로젝트',
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

const renderTodoList = (todos: Todo[], initialEntry = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <TodoList todos={todos} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )

const lastCallFor = (id: string) =>
  [...projectCardCalls]
    .reverse()
    .find((call) => (call.data as { todo: Todo }).todo.id === id)

// 마지막 렌더에서 화면에 나온 카드 id 목록
const lastRenderedIds = (count: number) =>
  projectCardCalls
    .slice(-count)
    .map((call) => (call.data as { todo: Todo }).todo.id)

describe('TodoList', () => {
  it('행 컴포넌트로 내려가는 핸들러 prop은 무관한 상태 변경(리렌더) 후에도 참조가 유지되어야 한다 (React.memo가 실제로 작동하려면 필요)', async () => {
    projectCardCalls.length = 0
    const user = setupUser()
    renderTodoList([makeTodo()])

    expect(projectCardCalls).toHaveLength(1)
    const before = projectCardCalls[0]

    // "새 프로젝트 추가"는 projectCards(따라서 ProjectCard 목록)와는 무관한
    // 모달 오픈 상태(isOpen)만 바꾼다 — 이 리렌더에서도 핸들러 참조가 안 바뀌어야
    // memo가 불필요한 행 리렌더를 실제로 걸러낸다.
    await user.click(screen.getByLabelText('새 프로젝트 추가'))

    expect(projectCardCalls.length).toBeGreaterThanOrEqual(2)
    const after = projectCardCalls[projectCardCalls.length - 1]

    expect(after.onCardClick).toBe(before.onCardClick)
    expect(after.onToggleExpand).toBe(before.onToggleExpand)
    expect(after.onEdit).toBe(before.onEdit)
    expect(after.onDelete).toBe(before.onDelete)
    expect(after.onAddChild).toBe(before.onAddChild)
  })

  it('한 프로젝트를 펼쳐도 다른 프로젝트의 data prop 참조는 바뀌지 않아야 한다 (memo가 실제로 걸러내려면 필요)', () => {
    projectCardCalls.length = 0
    const todoA = makeTodo({ id: 'todo-a', title: '프로젝트 A' })
    const todoB = makeTodo({ id: 'todo-b', title: '프로젝트 B' })
    renderTodoList([todoA, todoB])

    const findCall = (id: string) =>
      [...projectCardCalls]
        .reverse()
        .find((call) => (call.data as { todo: Todo }).todo.id === id)!

    const beforeA = findCall('todo-a')
    const beforeB = findCall('todo-b')
    expect(beforeA.isExpanded).toBe(false)
    expect(beforeB.isExpanded).toBe(false)

    const callCountBeforeToggle = projectCardCalls.length

    // 프로젝트 A의 펼치기 버튼을 누른 것과 동일한 효과 — ProjectCard는
    // 스텁이라 실제 아이콘 클릭이 불가능하므로 캡처해둔 onToggleExpand를
    // 직접 호출해 재현한다.
    act(() => {
      ;(beforeA.onToggleExpand as (id: string) => void)('todo-a')
    })

    expect(projectCardCalls.length).toBeGreaterThan(callCountBeforeToggle)

    const afterA = findCall('todo-a')
    const afterB = findCall('todo-b')

    expect(afterA.isExpanded).toBe(true)
    expect(afterA.data).toBe(beforeA.data)

    expect(afterB.isExpanded).toBe(false)
    expect(afterB.data).toBe(beforeB.data)
  })

  it('AI로 계획 버튼을 누르면 AI 플랜 모달이 열리고 닫힌다', async () => {
    renderTodoList([makeTodo()])

    fireEvent.click(screen.getByRole('button', { name: 'AI로 계획' }))
    expect(await screen.findByRole('dialog', { name: 'AI로 계획' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('stub 닫기'))
    expect(screen.queryByRole('dialog', { name: 'AI로 계획' })).not.toBeInTheDocument()
  })

  describe('검색·우선순위 필터 (받아온 todos를 거른다)', () => {
    const searchTodos = () => [
      makeTodo({ id: 'todo-a', title: '장보기', priority: 'high', order: 0 }),
      makeTodo({ id: 'todo-b', title: '이사 준비', order: 1 }),
      makeTodo({ id: 'child-b1', title: '전입 신고', parentId: 'todo-b' }),
      makeTodo({ id: 'child-b2', title: '짐 싸기', parentId: 'todo-b' }),
      makeTodo({ id: 'todo-c', title: '회의', description: '전입 서류 챙기기', order: 2 }),
    ]

    it('검색어를 입력해도 Firestore 읽기(getDocs)가 늘지 않는다', async () => {
      vi.mocked(getDocs).mockClear()
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.type(screen.getByPlaceholderText('할 일 검색...'), '전입')
      // 디바운스(300ms)가 지나 검색이 실제로 적용될 때까지 기다린다
      await waitFor(() => expect(document.body.textContent).toContain('검색 결과'))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })
      expect(getDocs).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('검색 결과 2건')
    })

    it('결과 수는 카드 수 기준이고, 하위만 걸린 카드는 자동 펼침되며 안 걸린 하위를 흐릴 수 있게 Set을 넘긴다', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.type(screen.getByPlaceholderText('할 일 검색...'), '전입')
      // 부모 todo-b(하위 매치) + todo-c(설명 매치) = 카드 2장. 하위 단독 카드는 없다.
      await waitFor(() =>
        expect(document.body.textContent).toContain('검색 결과 2건'),
      )
      expect(lastRenderedIds(2)).toEqual(['todo-b', 'todo-c'])

      const b = lastCallFor('todo-b')!
      expect(b.isExpanded).toBe(true)
      const highlighted = b.highlightedChildIds as ReadonlySet<string>
      expect(highlighted.has('child-b1')).toBe(true)
      expect(highlighted.has('child-b2')).toBe(false)
      // 루트가 직접 걸린 카드는 자동으로 펼치지 않는다
      expect(lastCallFor('todo-c')!.isExpanded).toBe(false)
    })

    it('필터가 없으면 highlightedChildIds를 넘기지 않는다(아무것도 흐리지 않음)', () => {
      projectCardCalls.length = 0
      renderTodoList(searchTodos())
      expect(lastCallFor('todo-b')!.highlightedChildIds).toBeUndefined()
    })

    it('우선순위 칩을 누르면 그 우선순위 카드만 남는다', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.click(screen.getByRole('button', { name: '높음' }))
      expect(document.body.textContent).toContain('검색 결과 1건')
      expect(lastRenderedIds(1)).toEqual(['todo-a'])
    })

    it('URL에 있던 검색어로 처음부터 걸러지고, 마운트 때 지워지지 않는다', async () => {
      projectCardCalls.length = 0
      renderTodoList(searchTodos(), '/?q=%EC%A0%84%EC%9E%85')

      expect(screen.getByPlaceholderText('할 일 검색...')).toHaveValue('전입')
      await waitFor(() =>
        expect(document.body.textContent).toContain('검색 결과 2건'),
      )
    })

    it('결과가 없으면 검색 빈 상태를 보여준다', async () => {
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.type(screen.getByPlaceholderText('할 일 검색...'), '없는검색어')
      expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument()
    })

    it('직접 펼친 카드 A는 검색을 지운 뒤에도 펼쳐져 있고, 검색으로 자동 펼쳐진 카드 B는 접힌다', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      act(() => {
        ;(lastCallFor('todo-a')!.onToggleExpand as (id: string) => void)('todo-a')
      })
      expect(lastCallFor('todo-a')!.isExpanded).toBe(true)

      const input = screen.getByPlaceholderText('할 일 검색...')
      await user.type(input, '전입')
      await waitFor(() => expect(lastCallFor('todo-b')!.isExpanded).toBe(true))

      await user.clear(input)
      await waitFor(() =>
        expect(document.body.textContent).not.toContain('검색 결과'),
      )
      expect(lastCallFor('todo-a')!.isExpanded).toBe(true)
      expect(lastCallFor('todo-b')!.isExpanded).toBe(false)
    })

    it('자동 펼쳐진 카드를 누르면 접히고, 다시 누르면 펼쳐진다', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.type(screen.getByPlaceholderText('할 일 검색...'), '전입')
      await waitFor(() => expect(lastCallFor('todo-b')!.isExpanded).toBe(true))

      const toggle = () =>
        act(() => {
          ;(lastCallFor('todo-b')!.onToggleExpand as (id: string) => void)('todo-b')
        })
      toggle()
      expect(lastCallFor('todo-b')!.isExpanded).toBe(false)
      toggle()
      expect(lastCallFor('todo-b')!.isExpanded).toBe(true)
    })

    it('빈 결과의 "검색 취소"를 누르면 입력이 비고 목록이 돌아온다(디바운스 후에도 검색이 되살아나지 않음)', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      const input = screen.getByPlaceholderText('할 일 검색...')
      await user.type(input, '없는검색어')
      const emptyTitle = await screen.findByText('검색 결과가 없습니다')
      // 검색칸 자체의 "검색 취소"가 아니라 빈 상태 안의 버튼을 누른다
      const emptyState = emptyTitle.parentElement as HTMLElement
      await user.click(within(emptyState).getByRole('button', { name: '검색 취소' }))

      // 디바운스(300ms)보다 충분히 기다려도 옛 검색어가 다시 적용되지 않아야 한다
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })
      expect(screen.getByPlaceholderText('할 일 검색...')).toHaveValue('')
      expect(screen.queryByText('검색 결과가 없습니다')).not.toBeInTheDocument()
      expect(document.body.textContent).not.toContain('검색 결과')
      expect(lastRenderedIds(3)).toEqual(['todo-a', 'todo-b', 'todo-c'])
    })

    it('검색칸의 "검색 취소"를 누르면 입력이 비고 목록이 돌아온다', async () => {
      projectCardCalls.length = 0
      const user = setupUser()
      renderTodoList(searchTodos())

      await user.type(screen.getByPlaceholderText('할 일 검색...'), '전입')
      await waitFor(() =>
        expect(document.body.textContent).toContain('검색 결과 2건'),
      )
      const [searchBoxCancel] = screen.getAllByRole('button', { name: '검색 취소' })
      await user.click(searchBoxCancel)

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })
      expect(screen.getByPlaceholderText('할 일 검색...')).toHaveValue('')
      expect(document.body.textContent).not.toContain('검색 결과')
      expect(lastRenderedIds(3)).toEqual(['todo-a', 'todo-b', 'todo-c'])
    })
  })
})

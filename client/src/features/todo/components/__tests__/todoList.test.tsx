import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/shared/ui/toast/toastContext'
import { setupUser } from '@/test/setupUser'
import TodoList from '../todoList'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock('../../hooks', () => ({
  useTodo: () => ({
    useDeleteTodo: { mutate: vi.fn(), isPending: false },
    useDeleteRecurringSeries: { mutate: vi.fn(), isPending: false },
  }),
  useSearchTodo: () => ({ data: undefined, isLoading: false }),
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

const renderTodoList = (todos: Todo[]) =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <TodoList todos={todos} />
      </MemoryRouter>
    </ToastProvider>,
  )

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
})

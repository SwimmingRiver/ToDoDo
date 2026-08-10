import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import TodoDetail from '../todoDetail'
import type { Todo } from '../../../types/todo.type'
import { ToastProvider } from '@/shared/ui/toast/toastContext'
import { setupUser } from '@/test/setupUser'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
  title: '테스트 할 일',
  description: '기존 설명 텍스트',
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

/**
 * 고정 객체를 반환하면 "서버 데이터가 갱신되는" 상황 자체를 재현할 수 없다.
 * useTodoDetail이 매 렌더 읽어가는 가변 홀더로 두어 refetch를 흉내낸다.
 */
const mockState = vi.hoisted(() => ({
  todo: null as unknown,
  /** true면 요청받은 id에 맞는 todo를 만들어 반환한다(다른 todo로 이동하는 시나리오용). */
  byId: false,
}))

vi.mock('../../../hooks', () => ({
  useTodoDetail: ({ id }: { id: string }) => ({
    todo: mockState.byId
      ? {
          id,
          userId: 'user-1',
          title: `${id} 제목`,
          description: `${id} 설명`,
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
        }
      : mockState.todo,
  }),
  useTodo: () => ({
    useUpdateTodo: { mutate: vi.fn() },
    useCreateRecurringTodo: { mutate: vi.fn() },
    useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
    useDeleteTodo: { mutate: vi.fn(), isPending: false },
    useDeleteRecurringSeries: { mutate: vi.fn(), isPending: false },
    useGetTodos: { data: [] },
  }),
}))

/**
 * 매번 새 엘리먼트를 만들어야 한다. 같은 엘리먼트 객체를 rerender에 넘기면 React가
 * 참조 동일성으로 서브트리 렌더를 통째로 건너뛰어, 리렌더가 일어난 것처럼 보이지만
 * 실제로는 아무 일도 일어나지 않는다(테스트가 거짓 통과한다).
 */
const detailUi = () => (
  <ToastProvider>
    <MemoryRouter initialEntries={['/todo/todo-1']}>
      <Routes>
        <Route path="/todo/:id" element={<TodoDetail />} />
      </Routes>
    </MemoryRouter>
  </ToastProvider>
)

const renderDetail = () => render(detailUi())

beforeEach(() => {
  mockState.todo = makeTodo()
  mockState.byId = false
})

const GoToOtherTodo = () => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/todo/B')}>
      B로 이동
    </button>
  )
}

describe('TodoDetail 컴포넌트', () => {
  it('기존 description이 설명 textarea에 표시되어야 한다', () => {
    renderDetail()

    const descInput = screen.getByPlaceholderText('상세 설명을 입력하세요') as HTMLTextAreaElement
    expect(descInput.value).toBe('기존 설명 텍스트')
  })

  it('제목도 description과 함께 정상 표시되어야 한다', () => {
    renderDetail()

    expect(screen.getByPlaceholderText('할 일 제목')).toHaveValue('테스트 할 일')
  })

  describe('서버 데이터 갱신 중 편집 내용 보존', () => {
    /**
     * useForm이 defaultValues가 아닌 values prop 기반이라, 넘긴 객체가 달라지면
     * 폼 전체가 리셋된다. 그런데 리셋을 유발하는 기능이 이 패널 안에 있다 —
     * 하위 할 일을 추가하면 createChildTodo가 부모 status/doneAt을 재계산하고
     * ["todoDetail"]을 무효화하므로, refetch된 status가 values를 바꾼다.
     * resetOptions.keepDirtyValues가 없으면 여기서 입력 중이던 설명이 사라진다.
     */
    it('편집 중인 설명은 서버 데이터가 바뀌어도 유지된다', async () => {
      const user = setupUser()
      const { rerender } = renderDetail()

      const desc = screen.getByPlaceholderText('상세 설명을 입력하세요')
      await user.clear(desc)
      await user.type(desc, '작성 중인 새 설명')

      // 하위 할 일 추가로 부모 status가 서버에서 바뀐 상황
      mockState.todo = makeTodo({ status: 'doing' })
      rerender(detailUi())

      expect(desc).toHaveValue('작성 중인 새 설명')
    })

    it('건드리지 않은 필드는 서버 값으로 갱신된다', async () => {
      // keepDirtyValues를 "values 동기화를 통째로 끄는" 식으로 잘못 고치면 이 테스트가 깨진다.
      const user = setupUser()
      const { rerender } = renderDetail()

      const desc = screen.getByPlaceholderText('상세 설명을 입력하세요')
      await user.type(desc, ' 추가분')

      mockState.todo = makeTodo({ title: '서버에서 바뀐 제목' })
      rerender(detailUi())

      expect(screen.getByPlaceholderText('할 일 제목')).toHaveValue('서버에서 바뀐 제목')
    })

    /**
     * keepDirtyValues는 "같은 todo를 보는 동안"만 유효해야 한다. 라우트 파라미터만
     * 바뀌면 React Router가 컴포넌트를 재마운트하지 않으므로(하위 할 일 카드 클릭이
     * 이 경로다), key를 주지 않으면 A에서 편집하던 값이 B로 넘어가고 저장 시
     * B의 설명을 A의 내용으로 덮어쓴다.
     */
    it('다른 todo로 이동하면 이전 편집 내용을 가져가지 않는다', async () => {
      mockState.byId = true
      const user = setupUser()
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/todo/A']}>
            <GoToOtherTodo />
            <Routes>
              <Route path="/todo/:id" element={<TodoDetail />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>,
      )

      const desc = screen.getByPlaceholderText('상세 설명을 입력하세요')
      await user.clear(desc)
      await user.type(desc, 'A에서 작성중')

      await user.click(screen.getByRole('button', { name: 'B로 이동' }))

      expect(screen.getByPlaceholderText('할 일 제목')).toHaveValue('B 제목')
      expect(screen.getByPlaceholderText('상세 설명을 입력하세요')).toHaveValue('B 설명')
    })
  })
})

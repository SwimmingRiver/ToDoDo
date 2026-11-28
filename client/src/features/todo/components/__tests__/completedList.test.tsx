import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EMPTY_TODO_FILTER, type TodoFilter } from '@tododo/core/dist/todoFilter/index.js'
import { setupUser } from '@/test/setupUser'
import CompletedList from '../completedList'
import type { Todo } from '../../types/todo.type'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}))

const authMock = vi.hoisted(() => ({
  currentUser: { uid: 'user-1' } as { uid: string } | null,
}))
vi.mock('@/shared/lib/firebase', () => ({
  auth: authMock,
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
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

const getArchivedTodosMock = vi.fn<() => Promise<Todo[]>>()
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getArchivedTodos: () => getArchivedTodosMock(),
}))

// 로컬 시각으로 만든 ISO 문자열(UTC 리터럴을 쓰지 않는다 — 어느 TZ에서도 같은 달력 날짜)
const localISO = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h).toISOString()

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
  title: '프로젝트',
  status: 'done',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: localISO(2026, 11, 20),
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: localISO(2026, 11, 1),
  updatedAt: localISO(2026, 11, 20),
  ...overrides,
})

const renderList = (todos: Todo[], filter: TodoFilter = EMPTY_TODO_FILTER) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CompletedList todos={todos} filter={filter} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('CompletedList (완료 탭)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 28, 9))
    navigateMock.mockClear()
    getArchivedTodosMock.mockReset()
    getArchivedTodosMock.mockResolvedValue([])
    authMock.currentUser = { uid: 'user-1' }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('최근 완료와 보관분을 합쳐 월 제목 두 개를 최신순으로 보여준다', async () => {
    getArchivedTodosMock.mockResolvedValue([
      makeTodo({
        id: 'old',
        title: '이사 준비',
        doneAt: localISO(2026, 9, 2),
        updatedAt: localISO(2026, 9, 2),
        archived: true,
      }),
    ])
    renderList([makeTodo({ id: 'recent', title: '기말 과제 제출' })])

    expect(await screen.findByText('이사 준비')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['2026년 11월', '2026년 9월'])
    expect(screen.getByText('기말 과제 제출')).toBeInTheDocument()
    expect(screen.getByText('11-20 완료')).toBeInTheDocument()
    expect(screen.getByText('09-02 완료')).toBeInTheDocument()
  })

  it('진행 중인 루트는 완료 탭에 나오지 않는다', async () => {
    renderList([
      makeTodo({ id: 'done', title: '끝난 일' }),
      makeTodo({ id: 'active', title: '하는 중', status: 'doing', doneAt: null }),
    ])
    expect(await screen.findByText('끝난 일')).toBeInTheDocument()
    expect(screen.queryByText('하는 중')).not.toBeInTheDocument()
  })

  it('읽기 전용: 수정·삭제 버튼이 없고, 카드를 눌러도 상세로 가지 않고 펼치기만 한다', async () => {
    const user = setupUser()
    renderList([
      makeTodo({ id: 'p', title: '기말 과제 제출', description: '교수님께 메일로' }),
      makeTodo({ id: 'c1', title: '자료 조사', parentId: 'p' }),
    ])

    const toggle = await screen.findByRole('button', { name: /기말 과제 제출/ })
    expect(screen.queryByRole('button', { name: /삭제|수정/ })).toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('자료 조사')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(navigateMock).not.toHaveBeenCalled()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('자료 조사')).toBeInTheDocument()
    expect(screen.getByText('교수님께 메일로')).toBeInTheDocument()
    // 펼친 뒤에도 편집 UI가 생기지 않는다
    expect(screen.queryByRole('button', { name: /삭제|수정|추가|상태/ })).toBeNull()
  })

  it('반복 시리즈는 한 달에 한 장으로 묶여 "3회 완료"를 보여준다', async () => {
    const instance = (id: string, day: number) =>
      makeTodo({
        id,
        title: '물 마시기',
        recurrenceId: 'series-1',
        recurrence: { type: 'daily', endType: 'indefinite' },
        doneAt: localISO(2026, 11, day),
        updatedAt: localISO(2026, 11, day),
      })
    renderList([instance('r1', 3), instance('r2', 4), instance('r3', 5)])

    expect(await screen.findByText('3회 완료')).toBeInTheDocument()
    expect(screen.getAllByText('물 마시기')).toHaveLength(1)
    expect(screen.getByText('11-05 완료')).toBeInTheDocument()
  })

  it('보관분 조회가 실패해도 최근 완료 카드는 보이고 안내가 나온다', async () => {
    getArchivedTodosMock.mockRejectedValue(new Error('permission-denied'))
    renderList([makeTodo({ id: 'recent', title: '기말 과제 제출' })])

    expect(await screen.findByText('지난 기록을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('기말 과제 제출')).toBeInTheDocument()
  })

  it('로그인 정보(uid)가 없어 보관분 조회가 꺼져 있으면 로딩 안내 없이 최근 완료만 보여준다', async () => {
    authMock.currentUser = null
    renderList([makeTodo({ id: 'recent', title: '기말 과제 제출' })])

    expect(await screen.findByText('기말 과제 제출')).toBeInTheDocument()
    expect(screen.queryByText('지난 기록을 불러오는 중…')).not.toBeInTheDocument()
    expect(getArchivedTodosMock).not.toHaveBeenCalled()
  })

  it('uid가 없고 최근 완료도 없으면 로딩에 멈추지 않고 빈 상태를 보여준다', async () => {
    authMock.currentUser = null
    renderList([])

    expect(await screen.findByText('완료한 프로젝트가 아직 없어요')).toBeInTheDocument()
    expect(screen.queryByText('지난 기록을 불러오는 중…')).not.toBeInTheDocument()
  })

  it('완료한 것이 없으면 빈 상태를 보여준다', async () => {
    renderList([makeTodo({ id: 'active', status: 'todo', doneAt: null })])
    expect(await screen.findByText('완료한 프로젝트가 아직 없어요')).toBeInTheDocument()
  })

  it('필터 결과가 없으면 검색 빈 상태를 재사용한다', async () => {
    renderList([makeTodo({ id: 'p', title: '기말 과제 제출' })], {
      query: '없는검색어',
      priorities: [],
    })
    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('완료한 프로젝트가 아직 없어요')).not.toBeInTheDocument()
  })

  it('하위만 걸린 카드는 자동으로 펼쳐지고, 안 걸린 하위는 흐리게 보인다', async () => {
    renderList(
      [
        makeTodo({ id: 'p', title: '이사' }),
        makeTodo({ id: 'c1', title: '전입 신고', parentId: 'p' }),
        makeTodo({ id: 'c2', title: '짐 싸기', parentId: 'p' }),
      ],
      { query: '전입', priorities: [] },
    )

    const toggle = await screen.findByRole('button', { name: /이사/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const card = toggle.closest('[data-completed-card]') as HTMLElement
    expect(within(card).getByText('전입 신고').closest('[data-dimmed]')).toBeNull()
    expect(within(card).getByText('짐 싸기').closest('[data-dimmed]')).not.toBeNull()
  })
})

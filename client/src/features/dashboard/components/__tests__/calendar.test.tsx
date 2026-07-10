import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Calendar from '../calendar'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
}))

const { mockTodos } = vi.hoisted(() => {
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  const makeTodo = (i: number) => ({
    id: `todo-${i}`,
    userId: 'user-1',
    title: `할 일 ${i}번`,
    status: 'todo' as const,
    priority: 'medium' as const,
    startAt: null,
    dueAt: todayStr,
    doneAt: null,
    parentId: null,
    order: i,
    recurrence: null,
    recurrenceId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  })
  return { mockTodos: [1, 2, 3, 4, 5].map(makeTodo) }
})

vi.mock('@/features/todo', () => ({
  useTodo: () => ({
    useGetTodos: { data: mockTodos, isLoading: false, isError: false },
    useUpdateTodoDueAt: { mutate: vi.fn() },
  }),
  TodoForm: () => null,
}))

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    useToast: () => ({ error: vi.fn(), success: vi.fn() }),
  }
})

const renderCalendar = () =>
  render(
    <MemoryRouter>
      <Calendar />
    </MemoryRouter>,
  )

describe('Calendar 하루 다건 "+N개" 표시', () => {
  beforeAll(() => {
    // jsdom에는 ResizeObserver가 없다
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('하루에 할 일이 많으면 "+N개" more 링크가 표시된다', async () => {
    renderCalendar()
    const moreLink = await screen.findByText(/\+\d+개/)
    expect(moreLink).toBeInTheDocument()
  })

  it('"+N개" 클릭 시 FC 기본 팝오버 대신 바텀시트가 열린다', async () => {
    renderCalendar()
    const moreLink = await screen.findByText(/\+\d+개/)
    fireEvent.click(moreLink)

    // 바텀시트가 열려 그 날짜의 목록 + 추가 버튼이 보인다
    expect(await screen.findByText('이 날짜에 할 일 추가')).toBeInTheDocument()
    expect(screen.getAllByText(/마감:/).length).toBeGreaterThan(0)
    // FullCalendar 기본 팝오버는 열리지 않아야 한다
    expect(document.querySelector('.fc-popover')).toBeNull()
  })
})

// 구버전 생성 경로(일반/하위 할 일)는 폼 값을 정규화 없이 저장해서 시작일을
// 비워두면 startAt이 null이 아니라 ""(빈 문자열)로 저장됐다. 캘린더가 ??로
// null만 거르면 ""가 이벤트 시작일이 되어 FC가 이벤트를 통째로 버린다.
describe('Calendar 빈 문자열 startAt 방어', () => {
  let saved: (typeof mockTodos)[number][]

  beforeAll(() => {
    saved = [...mockTodos]
  })

  afterAll(() => {
    mockTodos.splice(0, mockTodos.length, ...saved)
  })

  it('startAt이 ""로 저장된 마감일 전용 할 일이 마감일 셀에 표시된다', async () => {
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`

    mockTodos.splice(0, mockTodos.length, {
      ...saved[0],
      id: 'empty-start-todo',
      title: '빈 시작일 할 일',
      startAt: '',
      dueAt: `${key}T00:00`, // 구버전 생성 경로의 raw datetime-local 형식
    } as unknown as (typeof mockTodos)[number])

    renderCalendar()
    await screen.findByText('빈 시작일 할 일')

    const dueCell = document.querySelector(`[data-date="${key}"]`)
    expect(dueCell?.textContent).toContain('빈 시작일 할 일')
  })
})

// dueAt은 UTC Z 문자열로 저장되므로(todoForm이 toISOString 사용), KST에서
// 자정~오전 9시 마감은 UTC 날짜가 전날이 된다. 캘린더가 UTC 기준으로 날짜를
// 뽑으면 마감일 전날 셀에 표시되는 회귀를 막는다. CI는 UTC라서 TZ를 비-UTC로
// 고정해야 실제로 검증된다.
describe('Calendar 타임존: 자정 마감 할 일', () => {
  let originalTz: string | undefined
  let savedTodos: (typeof mockTodos)[number][]

  beforeAll(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'Asia/Seoul'
    savedTodos = [...mockTodos]
  })

  afterAll(() => {
    process.env.TZ = originalTz
    mockTodos.splice(0, mockTodos.length, ...savedTodos)
  })

  it('KST 자정 마감(UTC로는 전날) 할 일이 마감일 셀에 표시된다', async () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    const kstMidnight = new Date(y, m, d, 0, 0) // KST 자정
    const dueDateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    mockTodos.splice(0, mockTodos.length, {
      ...savedTodos[0],
      id: 'midnight-todo',
      title: '자정 마감 할 일',
      startAt: null,
      dueAt: kstMidnight.toISOString(), // 전날 15:00Z
    })

    renderCalendar()
    await screen.findByText('자정 마감 할 일')

    const dueCell = document.querySelector(`[data-date="${dueDateKey}"]`)
    expect(dueCell?.textContent).toContain('자정 마감 할 일')
  })
})

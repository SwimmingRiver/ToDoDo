import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom'
import Calendar from '../calendar'
import { toDateKey } from '@/shared/utils/date'
import { CalendarContainer } from '../calendar.styles'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock("@/features/calendarIntegration/components/calendarConnectionButton", () => ({
  default: () => null,
}));
const { mockMarkConnected, mockToast } = vi.hoisted(() => ({
  mockMarkConnected: vi.fn(async () => {}),
  mockToast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/features/calendarIntegration/hooks", () => ({
  useMarkCalendarConnected: () => ({ markConnected: mockMarkConnected }),
  useGoogleCalendarEvents: vi.fn(() => ({ data: [] })),
}));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

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
  useGetTodos: () => ({ data: mockTodos, isLoading: false, isError: false }),
  useUpdateTodoDueAt: () => ({ mutate: vi.fn() }),
  TodoForm: () => null,
}))

const { mockViewport } = vi.hoisted(() => ({ mockViewport: { isMobile: false } }))

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    useToast: () => mockToast,
    useMediaQuery: () => mockViewport.isMobile,
  }
})

const renderCalendar = () =>
  render(
    <MemoryRouter>
      <Calendar />
    </MemoryRouter>,
  )

// 다크 모드에서 이벤트 칩(.fc-daygrid-event) 배경이 밝아지는데도 FullCalendar
// 기본 --fc-event-text-color(#fff)가 그대로면 흰 배경에 흰 글자가 겹쳐
// 텍스트가 안 보인다. 이벤트 아이콘(구글/반복)에 이미 쓰는
// colors.brand.onStrong(라이트=흰색, 다크=거의 검정)으로 맞춰야
// 테마와 무관하게 항상 읽힌다.
describe('Calendar 이벤트 칩 텍스트 색상', () => {
  it('--fc-event-text-color가 brand.onStrong 토큰을 참조한다', () => {
    const { container } = render(<CalendarContainer />)
    const el = container.firstChild as HTMLElement
    const value = getComputedStyle(el).getPropertyValue('--fc-event-text-color').trim()
    expect(value).toBe('var(--brand-on-strong)')
  })
})

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

// 모바일 너비에선 격자의 이벤트 바가 6px라 직접 누르기 어렵다 — 날짜 바텀시트의
// 목록 항목이 상세로 가는 유일한 실용적 경로다.
describe('Calendar 날짜 바텀시트 → 상세 이동', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    // jsdom에는 ResizeObserver가 없다(단독 실행 시 다른 describe의 beforeAll에 기대지 않도록)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    // 단언이 실패해도 다음 테스트에 구글 이벤트가 새지 않도록 여기서 되돌린다
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({ data: [] } as never)
  })

  it('바텀시트의 할 일 항목을 누르면 해당 할 일 상세로 이동한다', async () => {
    renderCalendar()
    fireEvent.click(await screen.findByText(/\+\d+개/))

    // 접근 이름에 제목뿐 아니라 상태·마감 정보도 남아 있어야 스크린리더가 항목을 구분한다
    const item = await screen.findByRole('button', { name: /할 일 5번.*마감:.*상세 보기/ })
    fireEvent.click(item)

    expect(mockNavigate).toHaveBeenCalledWith('/todo/todo-5')
  })

  // 격자에 회색 바로 보이는 구글 일정이 시트에서 빠지면, 그 바를 눌렀을 때
  // "할 일이 없습니다"가 뜬다. 읽기 전용으로만 보여주고 이동은 하지 않는다.
  it('바텀시트에 그 날짜의 구글 일정이 읽기 전용으로 함께 표시된다', async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    const d = new Date()
    const todayStr = toDateKey(d)
    const tomorrowStr = toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({
      data: [{ id: 'g-sheet', title: '시트 회의', start: todayStr, end: tomorrowStr }],
    } as never)

    renderCalendar()
    fireEvent.click(await screen.findByText(/\+\d+개/))

    const sheetRow = await screen.findByText('구글 캘린더 · 종일')
    expect(sheetRow).toBeInTheDocument()
    // 읽기 전용: 구글 행은 버튼이 아니다
    expect(screen.queryByRole('button', { name: /시트 회의/ })).toBeNull()
  })

  it('전날 밤에 시작해 오늘로 넘어온 구글 일정은 시작 시각 대신 "전날부터 이어짐"으로 표시된다', async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 23, 30).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 1, 0).toISOString()
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({
      data: [{ id: 'g-overnight', title: '밤샘 배포', start, end }],
    } as never)

    renderCalendar()
    fireEvent.click(await screen.findByText(/\+\d+개/))

    expect(await screen.findByText('구글 캘린더 · 전날부터 이어짐')).toBeInTheDocument()
  })
})

// 모바일 격자의 이벤트 바는 제목이 안 보여 무엇을 누르는지 알 수 없다 — 바로
// 상세로 보내지 말고 그 날짜 바텀시트를 띄워 목록에서 고르게 한다.
describe('Calendar 모바일 이벤트 탭 → 날짜 바텀시트', () => {
  const todayKey = () => toDateKey(new Date())

  /** jsdom은 레이아웃이 없으므로 칸 사각형을 직접 지정한다 */
  const fakeCell = (dateKey: string, rect: { left: number; right: number; top: number; bottom: number }) => {
    const td = document.createElement('td')
    td.className = 'fc-daygrid-day'
    td.setAttribute('data-date', dateKey)
    td.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => ({}) })
    return td
  }

  beforeEach(() => {
    mockNavigate.mockClear()
    // jsdom에는 ResizeObserver가 없다(단독 실행 시 다른 describe의 beforeAll에 기대지 않도록)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    mockViewport.isMobile = false
    vi.unstubAllGlobals()
    // jsdom에는 없으므로 테스트에서 붙인 것만 지운다
    delete (document as { elementsFromPoint?: unknown }).elementsFromPoint
  })

  it('모바일에서 이벤트를 누르면 상세 대신 그 날짜 바텀시트가 열린다', async () => {
    mockViewport.isMobile = true
    renderCalendar()
    fireEvent.click(await screen.findByText('할 일 1번'))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('button', { name: `${todayKey()} 날짜에 새 할 일 추가` }),
    ).toBeInTheDocument()
  })

  it('모바일에서는 이벤트 시작일이 아니라 실제로 누른 칸의 날짜로 시트를 연다', async () => {
    mockViewport.isMobile = true
    renderCalendar()
    const eventEl = await screen.findByText('할 일 1번')

    // 월~목 바의 수요일 칸을 누른 상황. FC는 바를 시작 칸(월) 안에 그리므로 그 칸이
    // 조상으로서 결과에 먼저 섞인다 — 좌표를 실제로 포함하는 칸(수)을 골라야 한다.
    const startCell = fakeCell('2099-01-13', { left: 0, right: 50, top: 0, bottom: 50 })
    const tappedCell = fakeCell('2099-01-15', { left: 100, right: 150, top: 0, bottom: 50 })
    document.elementsFromPoint = () => [eventEl, startCell, tappedCell]

    fireEvent.click(eventEl, { detail: 1, clientX: 120, clientY: 20 })

    expect(
      await screen.findByRole('button', { name: '2099-01-15 날짜에 새 할 일 추가' }),
    ).toBeInTheDocument()
    // 제목도 같은 날이어야 한다 — "yyyy-MM-dd"를 UTC로 해석하면 서쪽 타임존에서 14일로 밀린다
    expect(screen.getByText('2099년 1월 15일')).toBeInTheDocument()
  })

  it('키보드로 누르면(좌표 0,0) 좌표 판정을 건너뛰고 이벤트가 놓인 칸의 날짜를 쓴다', async () => {
    mockViewport.isMobile = true
    renderCalendar()
    const eventEl = await screen.findByText('할 일 1번')

    // 화면 좌상단(0,0)에 다른 날짜 칸이 있어도 그 칸을 쓰면 안 된다
    const cornerCell = fakeCell('2099-01-01', { left: 0, right: 50, top: 0, bottom: 50 })
    document.elementsFromPoint = () => [cornerCell]

    fireEvent.click(eventEl, { detail: 0, clientX: 0, clientY: 0 })

    expect(
      await screen.findByRole('button', { name: `${todayKey()} 날짜에 새 할 일 추가` }),
    ).toBeInTheDocument()
  })

  it('데스크톱에서는 이벤트를 누르면 기존대로 상세로 이동한다', async () => {
    renderCalendar()
    fireEvent.click(await screen.findByText('할 일 1번'))

    expect(mockNavigate).toHaveBeenCalledWith('/todo/todo-1')
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

describe('Calendar 구글 이벤트 읽기 전용', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('구글 이벤트를 클릭해도 상세 페이지로 이동하지 않는다', async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({
      data: [{ id: 'g-1', title: '외부 회의', start: todayStr, end: todayStr }],
    } as never)

    renderCalendar()
    const googleEventTitle = await screen.findByText('외부 회의')
    fireEvent.click(googleEventTitle)

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// OAuth 콜백은 /calendar?calendarConnected=1 로 돌아온다. 마운트 이펙트가
// 파라미터를 보고 markConnected + 토스트를 띄우는데, 파라미터 삭제는 라우터
// 내비게이션이라 비동기다 — StrictMode 이중 실행이나 리마운트 시 같은 클로저의
// searchParams를 다시 읽어 토스트가 두 번 뜬다. 또 markConnected(Firestore 쓰기)
// 실패를 무시하고 성공 토스트를 띄우면 사용자는 "연동됐다"고 믿지만 상태는
// 미연동으로 남는다.
describe('Calendar OAuth 콜백 파라미터 처리', () => {
  const renderWithParams = (search: string, strict = false) => {
    const tree = (
      <MemoryRouter initialEntries={[`/calendar${search}`]}>
        <Calendar />
      </MemoryRouter>
    )
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  }

  beforeEach(() => {
    mockMarkConnected.mockReset()
    mockMarkConnected.mockResolvedValue(undefined)
    mockToast.success.mockReset()
    mockToast.error.mockReset()
  })

  it('StrictMode 이중 마운트에서도 연동 완료 토스트는 한 번만 뜬다', async () => {
    renderWithParams('?calendarConnected=1', true)
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(1))
    expect(mockMarkConnected).toHaveBeenCalledTimes(1)
  })

  it('markConnected가 실패하면 성공 토스트 대신 에러 토스트를 띄운다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMarkConnected.mockRejectedValue(new Error('firestore down'))
    renderWithParams('?calendarConnected=1')
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1))
    expect(mockToast.success).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  // 파라미터 제거가 push 내비게이션이면 히스토리에 ?calendarConnected=1 이 남아
  // 뒤로가기 후 새로고침/링크 복사 시 markConnected와 토스트가 다시 실행된다.
  it('콜백 파라미터 제거는 히스토리 항목을 교체(replace)한다', async () => {
    const router = createMemoryRouter([{ path: '/calendar', element: <Calendar /> }], {
      initialEntries: ['/calendar?calendarConnected=1'],
    })
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('calendarError=1 이면 StrictMode에서도 실패 토스트가 한 번만 뜬다', async () => {
    renderWithParams('?calendarError=1', true)
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1))
    expect(mockMarkConnected).not.toHaveBeenCalled()
  })
})

// 구글 이벤트 오버레이가 "오늘+30일" 고정이 아니라 캘린더가 실제로 보여주는
// 날짜 범위를 조회해야 지난달/다음달로 이동했을 때도 구글 일정이 보인다.
describe('Calendar 구글 이벤트 오버레이 조회 범위', () => {
  beforeEach(async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    vi.mocked(useGoogleCalendarEvents).mockClear()
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({ data: [] } as never)
  })

  const lastRangeArg = async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    const calls = vi.mocked(useGoogleCalendarEvents).mock.calls
    return calls[calls.length - 1][0] as { start: string; end: string } | null
  }

  it('마운트 후 현재 보이는 달의 범위로 구글 이벤트를 조회한다', async () => {
    renderCalendar()
    await waitFor(async () => expect(await lastRangeArg()).not.toBeNull())

    const range = (await lastRangeArg())!
    const now = Date.now()
    expect(new Date(range.start).getTime()).toBeLessThanOrEqual(now)
    expect(new Date(range.end).getTime()).toBeGreaterThan(now)
  })

  it('다음 달로 이동하면 조회 범위도 다음 달로 바뀐다', async () => {
    renderCalendar()
    await waitFor(async () => expect(await lastRangeArg()).not.toBeNull())
    const before = (await lastRangeArg())!

    fireEvent.click(document.querySelector('.fc-next-button')!)

    await waitFor(async () => {
      const after = (await lastRangeArg())!
      expect(new Date(after.start).getTime()).toBeGreaterThan(new Date(before.start).getTime())
    })
  })
})

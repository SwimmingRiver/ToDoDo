# 오늘 페이지 상시 노출 할 일 추가 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 페이지(`/today`)에서 할 일이 이미 있는 상태에도 목록 페이지와 동일한 스타일의 "새 할일" 버튼이 하단에 항상 고정 노출되어, 어떤 상태에서든 새 할 일을 추가할 수 있게 한다.

**Architecture:** `TodayPage`의 `Container`를 flex column으로 재구성해 `WeekStrip`/`DailyProgress`는 상단 고정, 리스트/로딩/에러/빈 상태는 새 `ScrollArea`(flex:1, overflow-y:auto) 안으로, 신규 `AddButton`은 `ScrollArea` 바깥 하단에 항상 렌더링한다. 버튼 클릭 시 기존 `Modal`+`TodoForm` 흐름을 재사용하되 `initialDueAt`으로 현재 선택된 날짜를 넘긴다.

**Tech Stack:** React, TypeScript, styled-components, Vitest + React Testing Library

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-07-31-today-page-add-todo-design.md` (이 계획의 근거 문서)
- 버튼 스타일은 `client/src/features/todo/components/todoList.styles.tsx`의 `AddButton`과 시각적으로 동일해야 한다 (배경 `colors.brand.primary`, 높이 48px/모바일 44px, full-width, `border-radius: var(--border-radius-lg, 10px)`)
- 버튼은 로딩/에러/빈 상태/리스트 상태와 무관하게 항상 렌더링된다 (조건부 렌더링 금지)
- "오늘 할 일이 없습니다" `EmptyState`의 action prop(`actionLabel`/`actionIcon`/`onAction`)은 제거한다. "할 일을 불러오지 못했습니다" 에러 `EmptyState`의 "다시 시도" action은 그대로 유지한다
- `TodoForm`에는 `initialDueAt` prop으로 ``${selectedDate}T00:00`` 형식 문자열(`calendar.tsx`와 동일 패턴)을 전달한다
- 새 공용 컴포넌트를 만들지 않는다 — 스타일은 `todayPage.styles.tsx`에 feature-scoped로 추가한다
- 커밋은 브랜치 `feature/today-page-add-todo-button`에서 진행한다 (이미 체크아웃되어 있음)

---

### Task 1: 오늘 페이지 레이아웃 스타일 추가 (ScrollArea, AddButton)

**Files:**
- Modify: `client/src/features/today/pages/todayPage.styles.tsx`

**Interfaces:**
- Consumes: 없음 (styled-components 정의만 추가)
- Produces: `Container`(기존 유지, `overflow-y: auto` 제거), `ScrollArea`(신규), `List`(기존 유지), `AddButton`(신규) — Task 2가 이 네 가지를 `todayPage.tsx`에서 import해서 사용

현재 파일 전체 내용:

```tsx
import { styled } from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

export { Container, List };
```

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```tsx
import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

const AddButton = styled.button`
  width: 100%;
  height: 48px;
  flex-shrink: 0;
  background-color: ${colors.brand.primary};
  color: white;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--border-radius-lg, 10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #0d5e49;
  }

  ${media.mobile} {
    height: 44px;
  }
`;

export { Container, ScrollArea, List, AddButton };
```

- [ ] **Step 2: 타입체크로 문법 오류 확인**

Run: `cd client && npx tsc --noEmit`
Expected: 이 파일 관련 에러 없음 (아직 `todayPage.tsx`가 새 export를 쓰지 않으므로 `ScrollArea`/`AddButton` unused 경고는 없음 — named export라 unused 체크 대상이 아님)

- [ ] **Step 3: Commit**

```bash
git add client/src/features/today/pages/todayPage.styles.tsx
git commit -m "style: 오늘 페이지에 ScrollArea/AddButton 스타일 추가"
```

---

### Task 2: TodayPage 컴포넌트에 하단 고정 추가 버튼 연결

**Files:**
- Modify: `client/src/features/today/pages/todayPage.tsx`
- Test: `client/src/features/today/pages/__tests__/todayPage.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `Container`, `ScrollArea`, `List`, `AddButton` (from `./todayPage.styles`); 기존 `TodoForm` props `initialDueAt?: string`, `onClose?: () => void` (변경 없음, `client/src/features/todo/components/todoForm/todoForm.tsx` 그대로 사용)
- Produces: 없음 (최상위 페이지 컴포넌트)

먼저 테스트를 새 동작 기준으로 갱신한 뒤(TDD), 컴포넌트를 구현한다.

- [ ] **Step 1: 테스트 파일을 아래 전체 내용으로 교체**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from '../todayPage'
import { useTodayTodos } from '../../hooks/useTodayTodos'
import { useTodo } from '@/features/todo/hooks'
import type { Todo } from '@/features/todo/types/todo.type'
import type { UseTodayTodosResult } from '../../hooks/useTodayTodos'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
}))

vi.mock('../../hooks/useTodayTodos', () => ({
  useTodayTodos: vi.fn(),
}))

vi.mock('@/features/todo/hooks', () => ({
  useTodo: vi.fn(),
}))

vi.mock('@/features/todo/components/todoForm/todoForm', () => ({
  default: ({ initialDueAt, onClose }: { initialDueAt?: string; onClose: () => void }) => (
    <div>
      <span>할 일 폼</span>
      <span>초기 마감일: {initialDueAt ?? '없음'}</span>
      <button onClick={onClose}>폼 닫기</button>
    </div>
  ),
}))

// TodayItemSkeleton은 접근성 텍스트가 없는 순수 시각적 컴포넌트라
// 로딩 상태를 명확히 식별할 수 있도록 마커로 교체하고, 나머지 shared export는 실제 구현을 사용한다.
vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    TodayItemSkeleton: () => <div>로딩 스켈레톤</div>,
  }
})

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
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
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
  ...overrides,
})

const makeTodayTodosResult = (
  overrides: Partial<UseTodayTodosResult> = {},
): UseTodayTodosResult => ({
  inProgressTodos: [],
  doneTodos: [],
  doneCount: 0,
  totalCount: 0,
  markers: {},
  isLoading: false,
  isError: false,
  toggleDone: vi.fn(),
  ...overrides,
})

const refetch = vi.fn()

const renderPage = () => render(<MemoryRouter><TodayPage /></MemoryRouter>)

describe('TodayPage 컴포넌트', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 31, 9, 0))
    vi.mocked(useTodo).mockReturnValue({
      useGetTodos: { refetch } as unknown as ReturnType<typeof useTodo>['useGetTodos'],
    } as ReturnType<typeof useTodo>)
    refetch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('로딩 중이면 스켈레톤을 표시하고 목록/빈 상태는 표시하지 않아야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isLoading: true }),
    )

    renderPage()

    expect(screen.getByText('로딩 스켈레톤')).toBeInTheDocument()
    expect(screen.queryByText('오늘 할 일이 없습니다')).not.toBeInTheDocument()
  })

  it('에러 상태이면 에러 안내와 다시 시도 버튼을 표시해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isError: true }),
    )

    renderPage()

    expect(screen.getByText('할 일을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
  })

  it('다시 시도 버튼 클릭 시 refetch가 호출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isError: true }),
    )

    renderPage()
    fireEvent.click(screen.getByText('다시 시도'))

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('할 일이 없으면 빈 상태 안내를 표시해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    expect(screen.getByText('오늘 할 일이 없습니다')).toBeInTheDocument()
  })

  it('할 일이 없을 때 EmptyState 자체에는 더 이상 액션 버튼이 없어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    expect(screen.queryByText('새 할 일 추가')).not.toBeInTheDocument()
  })

  it('할 일이 없어도 하단 고정 추가 버튼은 노출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    expect(screen.getByText('새 할일')).toBeInTheDocument()
  })

  it('할 일이 있어도 하단 고정 추가 버튼이 계속 노출되어야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '진행 중 할 일' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ inProgressTodos: [inProgress], totalCount: 1 }),
    )

    renderPage()

    expect(screen.getByText('진행 중 할 일')).toBeInTheDocument()
    expect(screen.getByText('새 할일')).toBeInTheDocument()
  })

  it('로딩 중에도 하단 고정 추가 버튼은 노출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isLoading: true }),
    )

    renderPage()

    expect(screen.getByText('새 할일')).toBeInTheDocument()
  })

  it('에러 상태에서도 하단 고정 추가 버튼은 노출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({ isError: true }),
    )

    renderPage()

    expect(screen.getByText('새 할일')).toBeInTheDocument()
  })

  it('하단 고정 추가 버튼 클릭 시 할 일 추가 모달이 열려야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByText('새 할일'))

    expect(screen.getByText('할 일 폼')).toBeInTheDocument()
  })

  it('하단 고정 추가 버튼 클릭 시 현재 선택된 날짜가 초기 마감일로 전달되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByText('새 할일'))

    expect(screen.getByText('초기 마감일: 2026-07-31T00:00')).toBeInTheDocument()
  })

  it('날짜 셀 클릭 후 하단 추가 버튼을 누르면 새로 선택된 날짜가 초기 마감일로 전달되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByLabelText('8월 1일 토요일, 일정 없음'))
    fireEvent.click(screen.getByText('새 할일'))

    expect(screen.getByText('초기 마감일: 2026-08-01T00:00')).toBeInTheDocument()
  })

  it('모달의 닫기 콜백 호출 시 모달이 닫혀야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByText('새 할일'))
    expect(screen.getByText('할 일 폼')).toBeInTheDocument()

    fireEvent.click(screen.getByText('폼 닫기'))
    expect(screen.queryByText('할 일 폼')).not.toBeInTheDocument()
  })

  it('진행 중인 할 일이 있으면 "진행 중" 섹션에 표시해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '진행 중 할 일' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        totalCount: 1,
      }),
    )

    renderPage()

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('진행 중 할 일')).toBeInTheDocument()
    expect(screen.queryByText('완료')).not.toBeInTheDocument()
  })

  it('완료된 할 일이 있으면 "완료" 섹션에 표시해야 한다', () => {
    const done = makeTodo({ id: 'd1', title: '완료된 할 일', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        doneTodos: [done],
        doneCount: 1,
        totalCount: 1,
      }),
    )

    renderPage()

    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByText('완료된 할 일')).toBeInTheDocument()
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument()
  })

  it('진행 중/완료 할 일이 모두 있으면 두 섹션을 모두 표시해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '진행 중 할 일' })
    const done = makeTodo({ id: 'd1', title: '완료된 할 일', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        doneTodos: [done],
        doneCount: 1,
        totalCount: 2,
      }),
    )

    renderPage()

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('체크박스 클릭 시 toggleDone이 해당 todo와 함께 호출되어야 한다', () => {
    const toggleDone = vi.fn()
    const inProgress = makeTodo({ id: 'p1', title: '체크할 할 일' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        totalCount: 1,
        toggleDone,
      }),
    )

    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: '체크할 할 일 완료 처리' }))

    expect(toggleDone).toHaveBeenCalledWith(inProgress)
  })

  it('완료 진행률(DailyProgress)에 doneCount/totalCount를 전달해야 한다', () => {
    const inProgress = makeTodo({ id: 'p1', title: '할 일 A' })
    const done = makeTodo({ id: 'd1', title: '할 일 B', status: 'done' })
    vi.mocked(useTodayTodos).mockReturnValue(
      makeTodayTodosResult({
        inProgressTodos: [inProgress],
        doneTodos: [done],
        doneCount: 1,
        totalCount: 2,
      }),
    )

    renderPage()

    expect(screen.getByText('1 / 2 완료')).toBeInTheDocument()
  })

  it('날짜 셀 클릭 시 useTodayTodos가 새로운 selectedDate로 재호출되어야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()

    // 오늘(2026-07-31) 기준 주간 스트립에서 8/1 셀 클릭
    fireEvent.click(screen.getByLabelText('8월 1일 토요일, 일정 없음'))

    const lastCallArgs = vi.mocked(useTodayTodos).mock.calls.at(-1)
    expect(lastCallArgs?.[0]).toBe('2026-08-01')
  })

  it('다음 버튼 클릭 시 windowStart가 7일 뒤로 이동해야 한다', () => {
    vi.mocked(useTodayTodos).mockReturnValue(makeTodayTodosResult())

    renderPage()
    fireEvent.click(screen.getByLabelText('다음 날짜'))

    const lastCallArgs = vi.mocked(useTodayTodos).mock.calls.at(-1)
    expect(lastCallArgs?.[1]).toBe('2026-08-07')
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd client && npx vitest run src/features/today/pages/__tests__/todayPage.test.tsx`
Expected: FAIL — `screen.getByText('새 할일')`를 찾지 못하는 테스트들(하단 버튼 관련 신규/변경 테스트)이 실패. 기존 EmptyState 액션 관련 테스트도 `queryByText('새 할 일 추가')`가 여전히 존재해서 실패할 수 있음(컴포넌트를 아직 안 고쳤으므로)

- [ ] **Step 3: `todayPage.tsx` 전체를 아래 내용으로 교체**

```tsx
import { useState, useCallback } from "react";
import { Sun, Plus } from "lucide-react";
import { useTodayTodos } from "../hooks/useTodayTodos";
import { useTodo } from "@/features/todo/hooks";
import { formatTodayLabel } from "@/shared/utils/formatToday";
import { toDateKey, parseLocalDateOnly } from "@/shared/utils/date";
import { EmptyState, TodayItemSkeleton, Modal } from "@/shared";
import TodoForm from "@/features/todo/components/todoForm/todoForm";
import WeekStrip from "../components/weekStrip";
import DailyProgress from "../components/dailyProgress";
import TodaySection from "../components/todaySection";
import TodayTodoItem from "../components/todayTodoItem";
import { Container, ScrollArea, List, AddButton } from "./todayPage.styles";

const TodayPage = () => {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [windowStart, setWindowStart] = useState(() => toDateKey(new Date()));
  const [isAddOpen, setIsAddOpen] = useState(false);

  const shiftWindow = useCallback((days: number) => {
    setWindowStart((prev) => {
      const d = parseLocalDateOnly(prev);
      d.setDate(d.getDate() + days);
      return toDateKey(d);
    });
  }, []);

  const handleGoToToday = useCallback(() => {
    const today = toDateKey(new Date());
    setWindowStart(today);
    setSelectedDate(today);
  }, []);

  const {
    inProgressTodos,
    doneTodos,
    doneCount,
    totalCount,
    markers,
    isLoading,
    isError,
    toggleDone,
  } = useTodayTodos(selectedDate, windowStart);
  const { useGetTodos } = useTodo();

  const hasTodos = inProgressTodos.length > 0 || doneTodos.length > 0;

  return (
    <Container>
      <WeekStrip
        selectedDate={selectedDate}
        windowStart={windowStart}
        markers={markers}
        onSelectDate={setSelectedDate}
        onShiftLeft={() => shiftWindow(-7)}
        onShiftRight={() => shiftWindow(7)}
        onGoToToday={handleGoToToday}
      />
      <DailyProgress
        dateLabel={formatTodayLabel(selectedDate)}
        doneCount={doneCount}
        totalCount={totalCount}
      />

      <ScrollArea>
        {isLoading && <TodayItemSkeleton />}

        {!isLoading && isError && (
          <EmptyState
            icon={Sun}
            title="할 일을 불러오지 못했습니다"
            description="잠시 후 다시 시도해주세요"
            actionLabel="다시 시도"
            onAction={() => useGetTodos.refetch()}
          />
        )}

        {!isLoading && !isError && !hasTodos && (
          <EmptyState
            icon={Sun}
            title="오늘 할 일이 없습니다"
            description="여유로운 하루네요. 새로운 할 일을 추가해보세요"
          />
        )}

        {!isLoading && !isError && hasTodos && (
          <>
            {inProgressTodos.length > 0 && (
              <TodaySection title="진행 중">
                <List>
                  {inProgressTodos.map((todo) => (
                    <TodayTodoItem
                      key={todo.id}
                      todo={todo}
                      selectedDate={selectedDate}
                      onToggleDone={toggleDone}
                    />
                  ))}
                </List>
              </TodaySection>
            )}

            {doneTodos.length > 0 && (
              <TodaySection title="완료">
                <List>
                  {doneTodos.map((todo) => (
                    <TodayTodoItem
                      key={todo.id}
                      todo={todo}
                      selectedDate={selectedDate}
                      onToggleDone={toggleDone}
                    />
                  ))}
                </List>
              </TodaySection>
            )}
          </>
        )}
      </ScrollArea>

      <AddButton onClick={() => setIsAddOpen(true)}>
        <Plus size={16} />
        새 할일
      </AddButton>

      <Modal
        isOpen={isAddOpen}
        setIsOpen={setIsAddOpen}
        children={
          <TodoForm
            initialDueAt={`${selectedDate}T00:00`}
            onClose={() => setIsAddOpen(false)}
          />
        }
      />
    </Container>
  );
};

export default TodayPage;
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `cd client && npx vitest run src/features/today/pages/__tests__/todayPage.test.tsx`
Expected: PASS (모든 테스트)

- [ ] **Step 5: 전체 유닛 테스트 + 타입체크 + 린트 실행**

Run: `cd client && npm run test && npx tsc --noEmit && npm run lint`
Expected: 전부 통과 (다른 파일에서 `todayPage.styles`의 `Container`/`List` export를 참조하는 곳이 없는지도 이 과정에서 함께 확인됨)

- [ ] **Step 6: Commit**

```bash
git add client/src/features/today/pages/todayPage.tsx client/src/features/today/pages/__tests__/todayPage.test.tsx
git commit -m "feat: 오늘 페이지에 하단 고정 할 일 추가 버튼 연결"
```

---

### Task 3: 로컬 브라우저로 실제 동작 확인

**Files:** 없음 (코드 변경 없는 수동 검증 태스크)

**Interfaces:**
- Consumes: Task 2에서 완성된 `TodayPage`
- Produces: 없음

- [ ] **Step 1: 개발 서버 실행 확인**

Run: `cd client && npm run dev` (이미 실행 중이면 생략)

- [ ] **Step 2: 할 일이 있는 상태에서 확인**

브라우저로 `/today` 접속. 할 일이 1개 이상 있는 날짜에서 하단에 "새 할일" 버튼이 항상 보이는지, `WeekStrip`/`DailyProgress`는 상단에 고정되고 리스트만 스크롤되는지 확인.

- [ ] **Step 3: 버튼 클릭 → 모달 → 마감일 기본값 확인**

"새 할일" 버튼 클릭 후 모달이 열리고, 마감일 입력 필드에 현재 선택된 날짜가 기본값으로 채워져 있는지 확인. 다른 날짜(예: WeekStrip에서 다음 날짜)를 선택한 뒤 다시 버튼을 눌러 마감일 기본값이 바뀌는지 확인.

- [ ] **Step 4: 할 일이 없는 상태에서 확인**

할 일이 없는 날짜로 이동해 EmptyState 안내 문구만 보이고 자체 액션 버튼은 없는지, 하단 고정 버튼은 여전히 보이는지 확인.

- [ ] **Step 5: 모바일 너비에서 확인**

브라우저 창 너비를 480px 이하로 줄이거나 개발자 도구 반응형 모드로 전환해, 버튼 높이가 44px로 줄어들고 하단 탭바와 겹치지 않는지 확인.

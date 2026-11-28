# 할 일 검색·우선순위 필터·완료 보관함 (웹) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 목록·칸반에 받아온 데이터만 거르는 검색(제목+설명)과 우선순위 칩을 넣고, 목록에 읽기 전용 `완료` 탭(최근 완료 + 30일 지난 보관분)을 만든다.

**Architecture:** 판정(`matchesTodoFilter`)과 완료 탭 묶기(`buildCompletedGroups`)는 앱 1.1.0이 재사용하도록 `packages/core`의 순수 함수로 둔다. 웹은 기존 `["todos"]` 캐시를 거르기만 하고, 보관분만 `완료` 탭을 처음 열 때 `["archivedTodos"]`로 한 번 조회한다. 탭·검색어·칩은 URL 쿼리에 둔다.

**Tech Stack:** React 19 + TypeScript, styled-components, TanStack Query, react-router `useSearchParams`, Firestore 웹 SDK, @dnd-kit, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-28-todo-search-filter-archive-design.md` — 구현자는 반드시 함께 읽는다.

## Global Constraints

- 검색·필터 때문에 Firestore 읽기가 늘면 안 된다. 허용되는 추가 읽기는 `완료` 탭을 처음 열 때의 보관분 조회 1회뿐.
- 보관함(완료 탭)은 읽기 전용: 수정·삭제·하위 추가·상태 변경 UI 없음, 카드를 눌러도 상세(`/todo/:id`)로 가지 않음.
- 판정 규칙: 앞뒤 공백 제거한 검색어가 제목 또는 설명에 부분 일치(대소문자 무시, 양쪽 NFC 정규화) AND 우선순위 집합(비면 통과)에 포함.
- 웹은 core를 하위 경로로만 import: `@tododo/core/dist/<module>/index.js` (루트 `@tododo/core` import 금지 — 번들 함정). core를 고치면 `cd packages/core && npm run build`로 dist를 다시 만든 뒤 client 테스트를 돌린다.
- 날짜: `dueAt`/`doneAt`/`updatedAt`은 UTC `Z` 문자열 — `split("T")[0]` 금지, 월 키는 core `toDateKeyFromISO` → `toMonthKey`(로컬 게터).
- 색은 `client/CLAUDE.md` 토큰 규칙(`brand.fill` 위에 글자 금지), 다크 모드 대응. 파일명 camelCase.
- 커밋 hooks 우회(`--no-verify` 등) 금지. 서브에이전트에게도 이 문구를 그대로 전달.
- CI 등가 검증: `cd client && VITE_FIREBASE_API_KEY= npx vitest run`, 날짜 관련은 `TZ=America/New_York`로도 실행.
- 브랜치: `git fetch` 후 `origin/develop`에서 딴다. PR은 develop 대상까지만.

## Review Focus

1. **이전 문서의 `priority`가 비어 있는 경우**: 칩을 켜면 걸리지 않고, 칩이 꺼져 있으면 보여야 한다. → Task 1 테스트
2. **URL에 이상한 값이 들어온 경우** (`?p=foo,high`, `?tab=xyz`): 모르는 값은 무시하고 화면은 정상이어야 한다(`p`는 `high`만, `tab`은 진행 중). → Task 3 테스트
3. **보관분 조회 실패**: 완료 탭이 비어 버리면 안 되고, 최근 완료분은 그대로 보이면서 "지난 기록을 불러오지 못했어요"를 안내해야 한다. → Task 5 테스트
4. **한글 입력 중 한 글자만 친 경우** (`"운"`): `"운동"`이 걸려야 한다. 공백만 있는 검색어는 필터가 꺼진 것으로 본다. → Task 1 테스트
5. **검색 중 펼친 카드**: 검색을 지우면 자동으로 펼쳐졌던 카드는 접히고, 사용자가 직접 펼친 카드는 그대로 펼쳐져 있어야 한다. → Task 4 테스트

---

### Task 1: core 판정 함수 `todoFilter`

**Files:**
- Create: `packages/core/src/todoFilter/index.ts`, `packages/core/src/todoFilter/matchTodo.ts`
- Test: `packages/core/src/todoFilter/__tests__/matchTodo.test.ts`
- Modify: `packages/core/src/index.ts` (export 추가)

**Interfaces:**
- Produces:
  - `type TodoPriority = "low" | "medium" | "high"`
  - `interface TodoFilter { query: string; priorities: readonly TodoPriority[] }`
  - `interface FilterableTodo { title: string; description?: string | null; priority?: TodoPriority | null }`
  - `matchesTodoFilter(todo: FilterableTodo, filter: TodoFilter): boolean`
  - `isTodoFilterActive(filter: TodoFilter): boolean` — 정리된 검색어가 비어 있지 않거나 `priorities.length > 0`이면 true
  - `EMPTY_TODO_FILTER: TodoFilter = { query: "", priorities: [] }`

- [ ] **Step 1: 실패하는 테스트 작성** — `describe("matchesTodoFilter")`
  - `"운동 30분"`, query `"운"` → true; query `"  운동 "` → true; query `"   "` → true(필터 꺼짐)
  - 제목엔 없고 description `"헬스장 가기"`, query `"헬스"` → true; description `undefined`/`null` + query `"x"` → false
  - 제목 `"Report"`, query `"report"` → true
  - NFD로 분해한 `"운동".normalize("NFD")` 제목 + NFC query `"운동"` → true (반대 방향도)
  - priority `"high"`, priorities `["high","medium"]` → true; `["low"]` → false
  - priority `undefined`, priorities `["high"]` → false; priorities `[]` → true
  - AND: 제목 일치 + 우선순위 불일치 → false
  - `isTodoFilterActive(EMPTY_TODO_FILTER)` → false, `{query:" ", priorities:[]}` → false, `{query:"", priorities:["low"]}` → true

- [ ] **Step 2: 실패 확인** — `cd packages/core && npx vitest run src/todoFilter` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 비교 전에 `s.normalize("NFC").toLocaleLowerCase()`로 정규화한다. `index.ts`에서 re-export하고, 루트 `src/index.ts`에 `export * from "./todoFilter";` 추가
- [ ] **Step 4: 통과 확인** — `npx vitest run src/todoFilter` PASS, `npm run build` 성공(`dist/todoFilter/index.js` 생성)
- [ ] **Step 5: 커밋** — `feat(core): 할 일 검색·우선순위 판정 함수`

### Task 2: core 완료 탭 묶기 `buildCompletedGroups`

**Files:**
- Create: `packages/core/src/todoFilter/completedGroups.ts`
- Test: `packages/core/src/todoFilter/__tests__/completedGroups.test.ts`
- Modify: `packages/core/src/todoFilter/index.ts`

**Interfaces:**
- Consumes: Task 1 `matchesTodoFilter`, `TodoFilter`, `FilterableTodo`; `toDateKeyFromISO`, `toMonthKey` from `../insights/date`
- Produces:
  - `interface CompletableTodo extends FilterableTodo { id: string; parentId: string | null; status: string; recurrenceId?: string | null; doneAt?: string | null; updatedAt: string }`
  - `type CompletedCard<T> = { kind: "project"; key: string; root: T; children: T[]; completedAt: string; matchedChildIds: ReadonlySet<string> } | { kind: "series"; key: string; root: T; count: number; completedAt: string }`
    - `project.key = root.id`, `series.key = \`${recurrenceId}:${monthKey}\``, series `root` = 그달 마지막 완료 회차
  - `interface CompletedMonthGroup<T> { monthKey: string /* "YYYY-MM" */; cards: CompletedCard<T>[] }`
  - `buildCompletedGroups<T extends CompletableTodo>(todos: readonly T[], filter: TodoFilter): CompletedMonthGroup<T>[]`

- [ ] **Step 1: 실패하는 테스트 작성** — 시스템 시간 고정(`vi.setSystemTime`), 픽스처 날짜는 로컬 생성자 `new Date(2026, 10, 20, 12).toISOString()`로 만든다(UTC 리터럴 금지 — 메모리 timezone 함정)
  - id가 같은 문서가 두 번 들어와도 한 장(중복 제거)
  - 완료 루트만 대상: `status:"todo"` 루트, 하위(`parentId` 있음)는 카드가 되지 않는다. 하위는 부모 카드의 `children`에 들어간다
  - 그룹은 `monthKey` 최신순, 카드는 `completedAt` 최신순. `completedAt = doneAt ?? updatedAt`
  - 반복: 같은 `recurrenceId`의 11월 완료 3건 + 10월 1건 → 11월 `series` 카드(count 3, 마지막 완료일) 1장 + 10월 카드 1장
  - 필터: 루트는 안 걸리고 하위만 걸리면 카드가 나오고 `matchedChildIds`에 그 하위가 들어간다. 아무것도 안 걸리면 카드가 없고, 빈 그룹은 빠진다
  - 필터가 꺼지면 모든 카드가 나오고 `matchedChildIds`는 비어 있다
  - 월 경계: 로컬 11-30 23:30 완료 → `"2026-11"` (`TZ=America/New_York`에서도 통과)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/todoFilter` FAIL
- [ ] **Step 3: 구현** — id로 중복 제거 → 하위를 `parentId`별로 모음 → 완료 루트를 `recurrenceId` 유무로 나눔 → series는 `(recurrenceId, monthKey)`로 묶음 → 필터 적용(series는 회차 중 하나라도 걸리면 표시) → 월 그룹
- [ ] **Step 4: 통과 확인** — `npx vitest run src/todoFilter` 그리고 `TZ=America/New_York npx vitest run src/todoFilter` 모두 PASS, `npm run build` 성공
- [ ] **Step 5: 커밋** — `feat(core): 완료 탭 월별·반복 시리즈 묶기`

### Task 3: 웹 공용 — URL 필터 상태, 우선순위 칩, 검색창 정리

**Files:**
- Create: `client/src/features/todo/hooks/useTodoFilterParams.ts`, `client/src/features/todo/components/priorityFilterChips.tsx`, `client/src/features/todo/components/priorityFilterChips.styles.tsx`
- Modify: `client/src/features/todo/components/todoSearch.tsx` (초기값 prop, 로딩 스피너 제거), `client/src/features/todo/hooks/index.ts`
- Test: `client/src/features/todo/hooks/__tests__/useTodoFilterParams.test.tsx`, `client/src/features/todo/components/__tests__/priorityFilterChips.test.tsx`

**Interfaces:**
- Consumes: Task 1 `TodoFilter`, `TodoPriority` (`@tododo/core/dist/todoFilter/index.js`)
- Produces:
  - `type ListTab = "active" | "done"`
  - `useTodoFilterParams(): { filter: TodoFilter; tab: ListTab; setQuery(q: string): void; togglePriority(p: TodoPriority): void; setTab(t: ListTab): void }`
    - URL 키: `q`(검색어), `p`(쉼표 구분, 순서 `high,medium,low`로 정규화), `tab`(`done`일 때만 기록, 아니면 제거). 모든 갱신은 `setSearchParams(..., { replace: true })`, 다른 쿼리 키는 보존
  - `PriorityFilterChips({ selected, onToggle }: { selected: readonly TodoPriority[]; onToggle(p: TodoPriority): void })` — 라벨 `높음`/`보통`/`낮음`, `<button aria-pressed>`
  - `TodoSearch`에 `initialValue?: string` 추가, `isLoading` prop 제거(로컬 필터라 필요 없음)

- [ ] **Step 1: 실패하는 테스트 작성**
  - `MemoryRouter initialEntries={["/list?p=foo,high&tab=xyz&x=1"]}` → `filter.priorities`는 `["high"]`, `tab`은 `"active"`, `x=1` 보존
  - `setQuery("운동")` → URL `q=운동`, 히스토리 길이 그대로(replace). `togglePriority("low")` 두 번 → `p` 제거
  - `setTab("done")` → `tab=done`, `setTab("active")` → `tab` 제거
  - 칩: 클릭하면 `onToggle("high")`가 불리고, 선택된 칩은 `aria-pressed="true"`
- [ ] **Step 2: 실패 확인** — `cd client && npx vitest run src/features/todo/hooks/__tests__/useTodoFilterParams.test.tsx src/features/todo/components/__tests__/priorityFilterChips.test.tsx` FAIL
- [ ] **Step 3: 구현** — 칩 스타일은 기존 `todoSearch.styles.tsx`와 브랜드 토큰을 따른다
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npx tsc -b` 오류 없음. 이 시점엔 `todoList.tsx`가 `isLoading`을 넘기지 않게만 고친다
- [ ] **Step 5: 커밋** — `feat(todo): 검색·우선순위 필터 URL 상태와 칩`

### Task 4: 웹 목록 `진행 중` — 받아온 데이터 필터로 교체

**Files:**
- Create: `client/src/features/todo/utils/activeSearch.ts`
- Modify: `client/src/features/todo/components/todoList.tsx`, `client/src/features/todo/components/projectCard.tsx`, `client/src/features/todo/components/childTodoCard.tsx`, `client/src/features/todo/components/projectCard.styles.tsx`
- Delete: `client/src/features/todo/hooks/useSearchTodo.ts`(+ hooks index export), `getSearchTodoList` in `client/src/features/todo/api/todoApi.ts:108`, 관련 테스트
- Test: `client/src/features/todo/utils/__tests__/activeSearch.test.ts`, `client/src/features/todo/components/__tests__/todoList.test.tsx`(있으면 수정, 없으면 생성)

**Interfaces:**
- Consumes: Task 1 `matchesTodoFilter`, `isTodoFilterActive`; Task 3 `useTodoFilterParams`, `PriorityFilterChips`, `TodoSearch`; 기존 `collapseRecurringInstances`(`../utils/projectUtils`)
- Produces:
  - `buildActiveSearchResult(todos: Todo[], filter: TodoFilter): { roots: Todo[]; matchedChildIds: ReadonlySet<string>; autoExpandIds: ReadonlySet<string> }`
    - 루트 후보 = `parentId === null && status !== "done"`를 `collapseRecurringInstances`로 축약(지금 목록과 같은 규칙)
    - 루트가 걸렸거나 하위가 하나라도 걸리면 포함. 루트는 안 걸리고 하위만 걸리면 `autoExpandIds`에 넣는다
    - 필터가 꺼지면 `roots`는 축약된 후보 전부이고 Set 두 개는 빈 값
  - `ProjectCard`에 `highlightedChildIds?: ReadonlySet<string>` prop 추가 → 펼칠 때 Set이 있으면 그 안에 없는 하위에 `ChildTodoCard dimmed` 적용
  - `ChildTodoCard`에 `dimmed?: boolean` prop 추가(흐림 스타일, 클릭·메뉴는 그대로)

- [ ] **Step 1: 실패하는 테스트 작성**
  - util: 하위만 걸림 → 부모 1건 + `autoExpandIds`에 부모. 부모와 하위가 모두 걸림 → 부모 1건(하위가 따로 나오지 않음). 반복 시리즈 회차 3건이 걸림 → 1건. 완료 루트는 제외. 필터가 꺼짐 → 지금 `todoTree`와 같은 id 순서
  - todoList: 검색어 입력 시 `getDocs`(firestore mock)가 추가로 호출되지 않는다. 결과 수 문구는 카드 수 기준(`검색 결과 N건`)
  - todoList(Review Focus 5): 카드 A를 직접 펼치고 검색어로 카드 B가 자동 펼쳐짐 → 검색을 지우면 B는 접히고 A는 계속 펼쳐짐(`isExpanded = expandedProjectIds.has(id) || autoExpandIds.has(id)`)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/todo` FAIL
- [ ] **Step 3: 구현** — `todoList.tsx`의 `searchQuery`/`useSearchTodo`/`searchResultTree`/`ChildTodoCard` 단독 렌더 분기를 지우고 `useTodoFilterParams` + `buildActiveSearchResult`로 바꾼다. `projectCards`의 memo 주석(펼침 상태를 의존성에서 뺀 이유)은 유지한다. 빈 결과는 기존 `SearchX` EmptyState를 재사용한다(검색어가 없으면 "조건에 맞는 할 일이 없습니다")
- [ ] **Step 4: 통과 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/todo` PASS, `npx tsc -b` 오류 없음, `git grep -n "getSearchTodoList\|useSearchTodo\|searchTodoList" client/src` 결과 0줄
- [ ] **Step 5: 커밋** — `feat(todo): 목록 검색을 받아온 데이터 필터로 바꾸고 설명·우선순위·하위 매치 지원`

### Task 5: 웹 목록 `완료` 탭 (보관분 지연 조회, 읽기 전용)

**Files:**
- Create: `client/src/features/todo/hooks/useGetArchivedTodos.ts`, `client/src/features/todo/components/completedList.tsx`, `client/src/features/todo/components/completedProjectCard.tsx`, `client/src/features/todo/components/completedList.styles.tsx`, `client/src/features/todo/components/listTabs.tsx`
- Modify: `client/src/features/todo/api/todoApi.ts`(`getArchivedTodos` 추가), `client/src/features/todo/hooks/useRunStartupMaintenance.ts`, `client/src/features/todo/hooks/useDeleteRecurringSeries.ts`, `client/src/features/todo/hooks/index.ts`, `client/src/features/todo/components/todoList.tsx`
- Test: `client/src/features/todo/hooks/__tests__/useGetArchivedTodos.test.tsx`, `client/src/features/todo/components/__tests__/completedList.test.tsx`, 기존 `useRunStartupMaintenance`·`useDeleteRecurringSeries` 테스트 수정

**Interfaces:**
- Consumes: Task 2 `buildCompletedGroups`, `CompletedCard`, `CompletedMonthGroup`; Task 3 `useTodoFilterParams`, `ListTab`; `useGetTodos`
- Produces:
  - `getArchivedTodos(): Promise<Todo[]>` — `where("userId","==",uid), where("archived","==",true)`, `mapDocToTodo`(같은 파일 `getTodos`와 같은 패턴)
  - `ARCHIVED_TODOS_KEY = ["archivedTodos"] as const` (export, 무효화에 사용)
  - `useGetArchivedTodos(enabled: boolean)` — `useQuery({ queryKey: ARCHIVED_TODOS_KEY, queryFn: getArchivedTodos, enabled, staleTime: Infinity })`
  - `ListTabs({ tab, onChange })` — `진행 중` / `완료`, `role="tablist"`
  - `CompletedList({ todos, filter }: { todos: Todo[]; filter: TodoFilter })` — 내부에서 `useGetArchivedTodos(true)`를 호출하고 `buildCompletedGroups([...todos, ...archived], filter)`로 렌더한다(마운트 = 탭을 연 순간)
  - `CompletedProjectCard({ card }: { card: CompletedCard<Todo> })` — 수정·삭제·추가·상태 UI 없음, 클릭하면 펼치기 토글만. project는 하위 목록(걸린 하위 강조, 나머지 흐림, 하위만 걸리면 자동 펼침)과 설명을, series는 "N회 완료"와 설명을 보여 준다. 날짜 문구는 `MM-DD 완료`
  - 월 제목 `YYYY년 M월`

- [ ] **Step 1: 실패하는 테스트 작성**
  - 무효화: `useRunStartupMaintenance` 성공 시 `written > 0`이면 `["todos"]`와 `ARCHIVED_TODOS_KEY`를 함께 무효화하고, `0`이면 둘 다 하지 않는다. `useDeleteRecurringSeries` 성공 시 `ARCHIVED_TODOS_KEY`도 무효화한다
  - 지연 조회: `진행 중` 탭에서는 `getArchivedTodos`가 0회 호출된다. `완료` 탭으로 바꾸면 1회. `["todos"]`를 무효화한 뒤 탭을 다시 열어도 1회 그대로
  - 렌더: 최근 완료 1건 + 보관 1건 → 월 제목 두 개, 최신순. 카드에 수정·삭제 버튼이 없다(`queryByRole("button", { name: /삭제|수정/ })` null). 카드를 클릭해도 `navigate`가 불리지 않는다
  - 반복 series 카드에 `3회 완료` 표시
  - Review Focus 3: `getArchivedTodos` reject → 최근 완료 카드는 보이고 `지난 기록을 불러오지 못했어요` 안내가 나온다
  - 빈 상태: 완료가 없으면 `완료한 프로젝트가 아직 없어요`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/todo` FAIL
- [ ] **Step 3: 구현** — `todoList.tsx` 상단에 `ListTabs`를 두고 `tab === "done"`이면 `CompletedList`, 아니면 Task 4의 진행 중 목록을 렌더한다. `+ 새 할 일`·AI 버튼은 진행 중 탭에서만 보인다. 검색창·칩은 두 탭 공통
- [ ] **Step 4: 통과 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/todo` 그리고 `TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run src/features/todo` PASS, `npx tsc -b` 오류 없음
- [ ] **Step 5: 커밋** — `feat(todo): 읽기 전용 완료 탭 — 최근 완료와 보관분을 월별로`

### Task 6: 웹 칸반 검색·칩 + 필터 중 같은 열 재정렬 잠금

**Files:**
- Modify: `client/src/features/kanban/components/kanbanBoard.tsx`, `client/src/features/kanban/hooks/useKanbanDrag.ts`, `client/src/features/kanban/components/kanbanBoard.styles.tsx`
- Test: `client/src/features/kanban/hooks/__tests__/useKanbanDrag.test.ts(x)`(기존 파일에 추가), `client/src/features/kanban/components/__tests__/kanbanBoard.test.tsx`(기존 또는 생성)

**Interfaces:**
- Consumes: Task 1 `matchesTodoFilter`, `isTodoFilterActive`; Task 3 `useTodoFilterParams`(`tab`은 사용 안 함), `TodoSearch`, `PriorityFilterChips`
- Produces: `UseKanbanDragProps`에 `isReorderLocked?: boolean`(기본 false) 추가 — true면 `handleDragEnd`의 같은 상태 분기(재정렬)에서 아무것도 하지 않고 return. 상태 변경 분기는 그대로

- [ ] **Step 1: 실패하는 테스트 작성**
  - drag: `isReorderLocked: true` + 같은 열 위로 드롭 → `onReorderTodos`가 불리지 않는다. 다른 열 위로 드롭 → `onUpdateTodo`가 새 status로 불린다. `false`면 기존 재정렬 동작 그대로
  - board: 검색어 `"보고서"` → 세 열(todo/doing/done) 모두 걸린 카드만 보이고 탭 카운트(`To Do (n)`)도 걸러진 수. 칩 `높음` → high만. 필터가 꺼지면 지금과 같다(`isVisibleInKanban` 함께 적용)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/kanban` FAIL
- [ ] **Step 3: 구현** — 열 분리(`todoList`/`doingList`/`doneList` useMemo) 전에 `matchesTodoFilter`를 적용하고, `useKanbanDrag`에 `isReorderLocked: isTodoFilterActive(filter)`를 넘긴다. 검색창·칩은 보드 위(`DndContext` 바깥)에 둔다
- [ ] **Step 4: 통과 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/kanban` PASS
- [ ] **Step 5: 커밋** — `feat(kanban): 검색·우선순위 필터, 필터 중 같은 열 재정렬 잠금`

### Task 7: 전체 검증과 PR

**Files:** 없음(검증·PR만)

- [ ] **Step 1: core** — `cd packages/core && npx vitest run && npm run build` PASS
- [ ] **Step 2: client 전체** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run` 그리고 `TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run` 모두 PASS, `npx tsc -b`·`npm run lint`·`npm run build` 성공
- [ ] **Step 3: 앱 영향 확인** — core만 바꿨으므로 `cd mobile && npx tsc --noEmit` 오류 없음(앱 코드는 고치지 않는다)
- [ ] **Step 4: 실제 화면 확인** — `cd client && npm run dev`로 목록(검색·칩·하위만 걸림 자동 펼침·완료 탭 월별·뒤로 가기 시 URL 상태 유지)과 칸반(필터·같은 열 끌기 잠금) 확인. 스크린샷이나 결과를 PR 본문에 남긴다
- [ ] **Step 5: PR** — develop 대상. 본문에 spec·plan 경로와 "앱 이식은 1.1.0 별도"를 적고, 병합은 사용자에게 맡긴다

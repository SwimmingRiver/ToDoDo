# 모바일 인사이트(완료 통계) 이식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 하단 4번째 탭 "통계"에 웹 인사이트와 같은 지표·카드·필터를 보여주고, 무료 사용자에게는 잠금 안내를 보여준다.

**Architecture:** 계산은 core 순수 함수(`computeInsightsMetrics`로 묶어 웹·앱 공유), 차트 기하는 core `layout*`, 앱은 react-native-svg로 그리기만 한다. 전체 이력 조회는 core `fetchAllUserTodos`를 공개해 쓴다. 갱신은 탭 포커스 시 마지막 조회가 60초보다 오래됐을 때만 + 당겨서 새로고침.

**Tech Stack:** Expo 57 / RN 0.86, @react-navigation 7, TanStack Query 5, react-native-svg 15(이미 네이티브 빌드에 포함 — LoginScreen·lucide가 사용), jest-expo + @testing-library/react-native, core는 vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-mobile-insights-design.md`

## Global Constraints

- 새 npm/네이티브 의존성 추가 금지(Pods 재설치·네이티브 재빌드가 필요 없어야 함).
- 날짜는 core 함수만으로 다룬다. `dueAt.split("T")` 등 문자열 자르기 금지.
- core를 바꾼 태스크는 `cd packages/core && npm run build` 후 `dist/`도 같이 커밋한다(CI가 `git diff --exit-code -- dist`로 막음).
- 앱의 core import는 기존 관례대로 `"@tododo/core"` 루트(jest는 `firebase/firestore`를 스텁으로 치환함).
- 터치 영역 최소 `MIN_TOUCH_TARGET`(`mobile/src/theme/spacing.ts`) — 기간 탭, 프로젝트 선택 버튼.
- 색은 `mobile/src/theme/colors.ts`·`statusColors.ts`만 사용(웹 토큰과 같은 이름: `brand.strong`, `text.secondary|tertiary|primary`, `border.tertiary`, `background.secondary`, `statusColors[s].main`).
- 문구는 웹과 동일. 고정 문구:
  - 잠금 제목 `완료 통계는 프리미엄 기능입니다`, 설명 `완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다`, 버튼 `구독 알아보기` → `navigate("Account")`
  - 에러 `통계를 불러오지 못했습니다` / `네트워크 연결을 확인하고 다시 시도해주세요`
  - 추이 빈 상태 `이 기간에 기록이 없습니다` / `할 일을 완료하면 여기에 추이가 쌓입니다`
  - 상태 구성 0건 `하위 할 일이 없습니다`, 카드 제목 `프로젝트 상태 구성`
  - 스트릭 `{n}일`, `연속 완료 중`(n>0) / `오늘부터 시작해보세요`(n=0), 캡션 `전체 기간 기준`
  - 요약 카드 라벨 `{periodLabel} 완료율|기한 준수율|반복 할 일 완료율|일반 할 일 완료율`, 값 `Math.round(rate*100)%`, 보조 `{completed} / {total}`
  - 우선순위 카드 제목 `{periodLabel} 완료한 할 일의 우선순위 분포`(행 순서 높음·보통·낮음), 추이 카드 제목 `{periodLabel} 완료 추이`
  - 프로젝트 버튼/시트: `전체 프로젝트`, 완료 프로젝트는 `{title} (완료)`, 시트 제목 `프로젝트`
  - 탭 이름·헤더 제목 `통계`
- 모든 커밋은 hooks를 통과해야 한다. `--no-verify` 등 hooks 우회 금지.
- 날짜 의존 테스트는 시스템 시간을 mock하고(`jest.useFakeTimers({ now })` / `vi.setSystemTime`), 커밋 전 `TZ=America/New_York`로도 한 번 실행한다.

## Review Focus

1. **무료 사용자가 탭에 포커스해도 조회가 나가지 않는다** — 포커스 refetch가 `isPremium`을 무시하면 안티골 위반. → Task 3 테스트 `포커스 refetch는 무료면 안 한다`.
2. **데이터가 있는 상태에서 새로고침이 실패해도 기존 숫자를 계속 보여준다** — 에러 화면은 데이터가 하나도 없을 때만. → Task 7 테스트 `새로고침 실패 시 기존 데이터 유지`.
3. **당겨서 새로고침이 실패해도 스피너가 멈춘다.** → Task 7 테스트 `새로고침 실패해도 refreshing 해제`.
4. **할 일이 0건인 프리미엄 사용자** — 카드 0% · `0 / 0`, 추이 빈 상태, 크래시 없음. → Task 7 테스트 `할 일 0건`.
5. **구독 직후(isPremium false→true) 화면에 머물러 있어도 통계가 뜬다** — 쿼리 `enabled`가 바뀌며 조회. → Task 3 테스트 `isPremium이 true가 되면 조회한다`.

---

### Task 1: core — `fetchAllUserTodos` 공개

**Files:**
- Modify: `packages/core/src/api/todoApi.ts` (함수 이동·export)
- Modify: `packages/core/src/recurring/startupMaintenanceApi.ts:39-45` (로컬 정의 삭제, import로 대체)
- Modify: `packages/core/src/index.ts:2` (export 목록에 추가)
- Test: `packages/core/src/api/__tests__/todoApi.test.ts`
- Build: `packages/core/dist/**`

**Interfaces:**
- Produces: `fetchAllUserTodos(db: Firestore, userId: string): Promise<Todo[]>` — `"@tododo/core"`에서 export. archived 필터 없음, 정렬 없음(기존 동작 그대로).

- [ ] **Step 1: 실패 테스트** — `todoApi.test.ts`에 `it("fetchAllUserTodos는 archived 조건 없이 userId로만 조회한다")`: `getDocs`가 archived:true 문서 1건 + false 1건을 돌려주면 결과 길이 2, `where`가 정확히 1번 `("userId", "==", "u1")`로 호출됐는지 단언.
- [ ] **Step 2:** `cd packages/core && npx vitest run src/api/__tests__/todoApi.test.ts` → FAIL(`fetchAllUserTodos` 미정의).
- [ ] **Step 3:** 함수를 `todoApi.ts`로 옮겨 export, `startupMaintenanceApi.ts`는 import해서 쓰고, `index.ts`의 todoApi export 목록에 추가. 주석(archived 포함 이유)은 옮긴다.
- [ ] **Step 4:** `npx vitest run` 전체 → PASS(`startupMaintenanceApi.test.ts` 포함). `npm run build` 후 `git status`에 dist 변경 확인.
- [ ] **Step 5: Commit** — `git add packages/core && git commit -m "refactor(core): fetchAllUserTodos를 todoApi로 옮겨 공개"`

### Task 2: core — `computeInsightsMetrics` + 웹 훅 전환

**Files:**
- Create: `packages/core/src/insights/summary.ts`
- Modify: `packages/core/src/insights/index.ts` (`export * from "./summary"`)
- Test: `packages/core/src/insights/__tests__/summary.test.ts`
- Modify: `client/src/features/insights/hooks/useProductivityMetrics.ts`
- Build: `packages/core/dist/**`

**Interfaces:**
- Produces:
  ```ts
  export interface InsightsMetrics {
    completionRate: CompletionRateResult;
    dueAdherence: CompletionRateResult;
    recurringVsOneOff: { recurring: CompletionRateResult; oneOff: CompletionRateResult };
    priorityDistribution: PriorityDistribution;
    trend: TrendBucket[];
    streak: number;
    statusBreakdown: StatusBreakdown | null; // projectId === null이면 null
    projects: ProjectOption[];
  }
  export const computeInsightsMetrics = (todos: Todo[], filter: InsightsFilter, now?: Date): InsightsMetrics
  ```
  본문은 현재 웹 `useProductivityMetrics`의 `useMemo` 안 계산과 한 줄도 다르지 않아야 한다(streak·projects는 `all`, 나머지는 `scoped`).

- [ ] **Step 1: 실패 테스트** — `summary.test.ts`: `vi.setSystemTime(new Date(2026, 10, 22, 12))`, 루트 1개+자식 3개(완료 2, 하나는 기한 넘겨 완료)+단독 반복 1개 픽스처(로컬 시각으로 만든 ISO). (a) `projectId:null`이면 `statusBreakdown === null`이고 `completionRate`·`streak`·`trend`가 개별 core 함수 호출 결과와 `toEqual`; (b) `projectId:"root"`면 `statusBreakdown`이 `computeStatusBreakdown(scoped,"root")`와 같고 `streak`은 필터와 무관하게 (a)와 같다.
- [ ] **Step 2:** `npx vitest run src/insights/__tests__/summary.test.ts` → FAIL.
- [ ] **Step 3:** `summary.ts` 구현.
- [ ] **Step 4:** core 전체 vitest PASS + `TZ=America/New_York npx vitest run src/insights` PASS. `npm run build`.
- [ ] **Step 5:** 웹 훅을 `useMemo(() => computeInsightsMetrics(todos ?? [], filter, new Date()), [todos, filter.period, filter.projectId])`로 교체(반환 모양 동일).
- [ ] **Step 6:** `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/insights` PASS(기존 `useProductivityMetrics.test.tsx`·`insightsPage.test.tsx` 무수정 통과).
- [ ] **Step 7: Commit** — `feat(core): 인사이트 지표 묶음 computeInsightsMetrics, 웹 훅이 사용`

### Task 3: 앱 — 통계 데이터 훅

**Files:**
- Create: `mobile/src/insights/useTodosForStats.ts`, `mobile/src/insights/useInsightsMetrics.ts`, `mobile/src/insights/index.ts`
- Test: `mobile/src/insights/__tests__/useTodosForStats.test.tsx`

**Interfaces:**
- Consumes: `fetchAllUserTodos`(Task 1), `computeInsightsMetrics`/`InsightsFilter`(Task 2), `useIsPremium()` → `{ isPremium, isLoading }`, `useAuthState()` → `{ user }`, `db` from `../firebase`.
- Produces:
  - `STATS_STALE_MS = 60_000`
  - `useTodosForStats(): UseQueryResult<Todo[]>` — `queryKey: ["todosForStats", uid]`, `enabled: !!uid && isPremium`, `staleTime: STATS_STALE_MS`. 내부에서 `useFocusEffect`(from `@react-navigation/native`)로 포커스 시 `enabled`이고 `Date.now() - dataUpdatedAt > STATS_STALE_MS`이면 `refetch()`. 마운트 직후 첫 조회는 useQuery 기본 동작에 맡긴다(포커스 콜백이 중복 요청하지 않게 `dataUpdatedAt === 0`이면 건너뜀).
  - `useInsightsMetrics(filter: InsightsFilter): InsightsMetrics & { isLoading: boolean; hasData: boolean; isError: boolean; refetch: () => Promise<unknown>; isRefetching: boolean }` — `useMemo`로 `computeInsightsMetrics(data ?? [], filter, new Date())`. `hasData = data !== undefined`.

- [ ] **Step 1: 실패 테스트** (QueryClientProvider 래퍼, `@react-navigation/native`의 `useFocusEffect`를 콜백을 저장해 두고 테스트가 직접 호출하는 mock으로, `@tododo/core`의 `fetchAllUserTodos`를 jest.fn으로 mock, `jest.useFakeTimers({ now: new Date(2026, 10, 22, 12) })`):
  - `무료면 조회하지 않는다` — isPremium=false → fetch 0회.
  - `포커스 refetch는 무료면 안 한다` — isPremium=false, 포커스 콜백 호출 → fetch 0회.
  - `isPremium이 true가 되면 조회한다` — false로 렌더 후 true로 rerender → fetch 1회.
  - `1분 이내 재포커스는 다시 읽지 않는다` — 첫 조회 완료 후 30초 진행, 포커스 → 총 1회.
  - `1분 지나 재포커스하면 다시 읽는다` — 61초 진행, 포커스 → 총 2회.
- [ ] **Step 2:** `cd mobile && npx jest src/insights` → FAIL.
- [ ] **Step 3:** 두 훅 구현, `index.ts`에서 export.
- [ ] **Step 4:** `npx jest src/insights` PASS, `npx tsc --noEmit` PASS.
- [ ] **Step 5: Commit** — `feat(mobile): 통계용 전체 이력 조회 훅(프리미엄 게이트·포커스 60초 갱신)`

### Task 4: 앱 — 차트 3종

**Files:**
- Create: `mobile/src/insights/charts/BarChart.tsx`, `HorizontalBars.tsx`, `StackedBar.tsx`, `useMeasuredWidth.ts`
- Test: `mobile/src/insights/charts/__tests__/charts.test.tsx`

**Interfaces:**
- Consumes: core `layoutBarChart({points,width,height})`, `layoutHorizontalBars({rows,width})`, `layoutStackedBar({segments,width})` 및 타입 `BarChartPoint`, `HorizontalBarRow`, `StackedBarSegment`.
- Produces (props는 웹 `client/src/features/insights/components/charts/*`와 같고, `ariaLabel` → `accessibilityLabel`, `formatTitle` 없음):
  - `BarChart({ points, width, height = 160, accessibilityLabel })`
  - `HorizontalBars({ rows, width, accessibilityLabel })` — 상수 ROW_HEIGHT 24, LABEL_WIDTH 40, VALUE_WIDTH 80, GAP 8, TRACK_HEIGHT 8, 값 텍스트 `{value} ({round(ratio*100)}%)`
  - `StackedBar({ segments, colorOf, width, accessibilityLabel })` — HEIGHT 24, RADIUS 6, `useId`로 ClipPath id
  - 각각 `width === 0`이거나 layout이 비면 `null`. 루트는 `<View accessible accessibilityRole="image" accessibilityLabel>`로 감싼 `<Svg>`.
  - `useMeasuredWidth(): { width: number; onLayout: (e: LayoutChangeEvent) => void }` — 초기 0.
  웹 컴포넌트의 좌표·색·폰트 크기를 그대로 옮긴다(`dominantBaseline="middle"`은 RN svg에서 `alignmentBaseline="middle"`).

- [ ] **Step 1: 실패 테스트** — `width 0이면 그리지 않는다`(세 컴포넌트 모두 `toJSON()`이 null), `BarChart는 점 개수만큼 막대를 그린다`(points 3개, width 300 → `UNSAFE_getAllByType(Rect)` 3개), `HorizontalBars 값 텍스트`(rows `[{label:"높음",value:2},{label:"보통",value:2},{label:"낮음",value:0}]` → `2 (50%)` 텍스트 존재), `접근성 라벨`(`getByLabelText("총 3건")`).
- [ ] **Step 2:** `npx jest src/insights/charts` → FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(mobile): 인사이트 차트 3종(react-native-svg, core 레이아웃)`

### Task 5: 앱 — 필터 바(기간 탭 + 프로젝트 바텀시트)

**Files:**
- Create: `mobile/src/insights/components/InsightsFilterBar.tsx`
- Test: `mobile/src/insights/components/__tests__/InsightsFilterBar.test.tsx`

**Interfaces:**
- Consumes: `PERIOD_PRESETS`, `PERIOD_TAB_LABELS`, `InsightsFilter`, `ProjectOption`, `BottomSheet`(`mobile/src/shared/ui/bottomSheet/BottomSheet.tsx`, `options/selectedValue/onSelect/title/isOpen/onClose`).
- Produces: `InsightsFilterBar({ filter, projects, onChange }: { filter: InsightsFilter; projects: ProjectOption[]; onChange: (next: InsightsFilter) => void })`. 전체 프로젝트의 시트 값은 상수 `ALL_PROJECTS = "__all__"`. 기간 탭은 `accessibilityRole="tab"` + `accessibilityState={{ selected }}`, 가로 4등분.

- [ ] **Step 1: 실패 테스트** — `기간 탭을 누르면 period만 바꾼다`(`최근 90일` 누름 → `onChange({period:"last90Days", projectId:"p1"})`), `프로젝트 버튼은 현재 값을 보여준다`(projectId null → `전체 프로젝트`, 완료 프로젝트 선택 시 `회고 (완료)`), `시트에서 고르면 projectId를 바꾼다`(버튼 → `기획` 선택 → `projectId:"p2"`), `시트에서 전체 프로젝트를 고르면 null`.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS + tsc.
- [ ] **Step 5: Commit** — `feat(mobile): 인사이트 필터 바`

### Task 6: 앱 — 카드들

**Files:**
- Create: `mobile/src/insights/components/StreakCard.tsx`, `SummaryCards.tsx`, `StatusBreakdownCard.tsx`, `PriorityDistributionCard.tsx`, `CompletionTrendCard.tsx`, `InsightsLockedNotice.tsx`, `InsightsSkeleton.tsx`, `index.ts`
- Test: `mobile/src/insights/components/__tests__/cards.test.tsx`

**Interfaces:**
- Consumes: Task 4 차트·`useMeasuredWidth`, `EmptyState`(`mobile/src/shared/ui/emptyState`), `Button`, core 타입.
- Produces (props는 웹 카드와 동일):
  - `StreakCard({ streak })`, `SummaryCards({ periodLabel, completionRate, dueAdherence, recurringVsOneOff })`(2×2 그리드), `StatusBreakdownCard({ breakdown })`(순서 todo/doing/done, 라벨 `할 일`/`진행 중`/`완료`, 범례 `{label} {n}`), `PriorityDistributionCard({ distribution, title })`, `CompletionTrendCard({ buckets, title })`(접근성 라벨 `{title}, 최대 {max}건`, 빈 상태는 `BarChart3` 아이콘), `InsightsLockedNotice({ onSubscribe })`(PlanLockedNotice와 같은 레이아웃), `InsightsSkeleton()`(카드 모양 회색 블록 4개 + opacity pulse — `ListSkeleton` 패턴).

- [ ] **Step 1: 실패 테스트** — 스트릭 0/3 문구, 요약 카드 `이번 달 완료율`·`72%`·`18 / 25`(completed 18 total 25 → 72%), 상태 구성 0건이면 `하위 할 일이 없습니다`이고 범례 없음, 상태 구성 범례 `진행 중 2`, 추이 버킷 전부 0이면 빈 상태 문구, 잠금 안내 버튼 누르면 `onSubscribe` 호출.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + tsc.
- [ ] **Step 5: Commit** — `feat(mobile): 인사이트 카드·잠금 안내·스켈레톤`

### Task 7: 앱 — InsightsScreen

**Files:**
- Create: `mobile/src/screens/InsightsScreen.tsx`
- Test: `mobile/src/screens/__tests__/InsightsScreen.test.tsx`

**Interfaces:**
- Consumes: `useIsPremium`, `useInsightsMetrics`(Task 3), Task 5·6 컴포넌트, `DEFAULT_INSIGHTS_FILTER`, `PERIOD_TITLE_LABELS`, `useNavigation().navigate("Account")`.
- Produces: `InsightsScreen()`.
- 렌더 규칙(순서대로): 권한 로딩 → 스켈레톤 / 무료 → 잠금 안내 / `isLoading` → 스켈레톤 / `isError && !hasData` → 에러 `EmptyState`(`AlertCircle`) / 그 외 → `ScrollView`(`RefreshControl`) 안에 필터 바 → 스트릭 → 요약 → (statusBreakdown 있으면) 상태 구성 → 우선순위 → 추이.
- 당겨서 새로고침: 로컬 `refreshing` 상태를 true로 두고 `refetch()`를 `finally`에서 false로(실패해도 해제). staleTime 무시.
- 선택 프로젝트가 `projects`에서 사라지면 `projectId: null`로 되돌리는 effect(웹 `insightsPage.tsx`와 동일).

- [ ] **Step 1: 실패 테스트** (`../../premium`, `../../insights`의 `useInsightsMetrics`, `@react-navigation/native` mock — AiPlanScreen.test 패턴):
  - `무료면 잠금 안내, 구독 알아보기 → Account`
  - `로딩 중 스켈레톤`
  - `데이터 없이 에러면 에러 문구`
  - `새로고침 실패 시 기존 데이터 유지` — hasData true + isError true → 에러 문구 없음, `이번 달 완료율` 보임
  - `새로고침 실패해도 refreshing 해제` — refetch가 reject → RefreshControl `refreshing` prop이 false로 돌아옴
  - `할 일 0건` — 실제 `computeInsightsMetrics([], DEFAULT_INSIGHTS_FILTER)` 결과를 넣고 `0%`·`0 / 0`·추이 빈 상태 문구
  - `선택 프로젝트가 사라지면 전체로` — 프로젝트 p1 선택 후 projects를 []로 rerender → 버튼이 `전체 프로젝트`
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + tsc.
- [ ] **Step 5: Commit** — `feat(mobile): 통계 화면`

### Task 8: 앱 — 통계 탭 배선

**Files:**
- Modify: `mobile/src/navigation/types.ts` (`InsightsStackParamList = { Insights: undefined; Account: undefined }`)
- Modify: `mobile/src/navigation/RootNavigator.tsx` (InsightsStack, `InsightsTabStack`, 탭 `통계`를 캘린더 뒤에, 아이콘 `ChartColumn` from lucide-react-native, `accountHeaderOptions` 재사용, Insights 화면 `options={{ title: "통계" }}`, Account는 `accountScreenOptions`)
- Test: `mobile/src/navigation/__tests__/RootNavigator.test.tsx` (lucide mock에 `ChartColumn`, `InsightsScreen` mock 추가)

- [ ] **Step 1: 실패 테스트** — `로그인하면 통계 스택에 Insights·Account가 등록된다`(mockStackScreens에 `{name:"Insights", options.title:"통계"}` 존재, `Account` 등록 수가 4).
- [ ] **Step 2:** FAIL. **Step 3:** 구현(`ChartColumn`이 설치된 lucide 버전에 없으면 `BarChart3` 사용 — `node -e "require('lucide-react-native').ChartColumn"`으로 확인).
- [ ] **Step 4:** `cd mobile && npx jest` 전체 PASS, `TZ=America/New_York npx jest src/insights src/screens/__tests__/InsightsScreen.test.tsx` PASS, `npx tsc --noEmit` PASS.
- [ ] **Step 5: Commit** — `feat(mobile): 하단 통계 탭`

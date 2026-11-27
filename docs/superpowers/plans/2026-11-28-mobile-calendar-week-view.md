# 앱 캘린더 월간/주간 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 캘린더 탭에 `[월간|주간]` 전환을 넣고, 주간은 하루 한 줄·7줄로 화면을 채워 할 일 제목을 칩으로 보여 준다.

**Architecture:** 월간은 기존 react-native-calendars `Calendar` 그대로. 주간은 직접 만든 `WeekRowsView`. 날짜·주 계산과 하루 칩 목록은 순수 함수로 분리해 TZ 두 개로 테스트하고, `CalendarScreen`이 보기 모드·주 시작·선택 날짜 상태를 들고 두 보기를 바꿔 그린다.

**Tech Stack:** Expo RN, TypeScript, jest-expo + @testing-library/react-native, react-native `PanResponder`(새 의존성 없음).

**Spec:** `docs/superpowers/specs/2026-11-27-mobile-calendar-week-view-design.md`

## Global Constraints

- 작업 위치 `mobile/`. 웹·`@tododo/core`·`app.json` version·EAS는 건드리지 않는다.
- 커밋 시 hooks 우회(--no-verify 등) 금지. 서브에이전트에게도 이 문구를 그대로 전달한다.
- 날짜 키는 `mobile/src/shared/utils/dateRange.ts`의 `toDateKey`·`toDateKeyFromISO`·`parseLocalDateOnly`를 쓴다. `split("T")[0]` 금지. 날짜 이동은 로컬 `Date`의 `setDate`로(24h 더하기 금지).
- 그날의 할 일은 `useCalendarTodos().getTodosForDate(dateKey)`(=`isDateInTodoRange`)를 재사용한다. 기간 펼치기 함수를 새로 만들지 않는다.
- 구글 일정 날짜 판정은 `@tododo/core/dist/calendarSync/index.js`의 `isDateInGoogleEventRange`, 중복 제거는 `filterUnsyncedEvents`.
- 주 시작은 일요일(월간 `Calendar`는 `firstDay` 미지정 = 0 = 일요일).
- 기한 초과 빨강은 **마감일 줄의 칩만**(`calendarMarkers.ts:44-47`과 같은 규칙).
- 색: 상태 `statusColors[status].main`, 기한 초과 `colors.danger.main`, 구글 `colors.text.tertiary`, 오늘·선택 `colors.brand.strong`.
- 모든 테스트는 기본(Asia/Seoul)과 `TZ=America/New_York` 두 번 통과해야 한다. 날짜 픽스처는 호출부와 같은 생성자로 만든다(로컬 날짜면 `new Date(y, m, d, h)`), UTC 리터럴 금지.
- 로컬 확인 명령: `cd mobile && npx jest <path>` 그리고 `cd mobile && TZ=America/New_York npx jest <path>`, 마지막에 `npx tsc --noEmit`.

## Review Focus

- 달·해가 바뀌는 주(11/29–12/5, 12/27–1/2)와 미국 서머타임 시작·끝 주(2026-03-08, 2026-11-01)에서 7칸이 정확히 연속된 7일이어야 한다 → Task 1 테스트
- 기간 할 일이 이미 기한을 넘겼을 때, 마감일 줄만 빨강이고 앞선 날 줄은 상태 색이어야 한다 → Task 2 테스트
- 칩이 많아 줄이 넘치는 날: 작은 줄 높이(70pt)에서도 칩 1개 + `+n`이 보이고 n이 정확해야 한다 → Task 3 테스트
- 세로 스크롤·탭이 스와이프로 오인되어 주가 넘어가면 안 된다(가로 50pt 미만, 또는 세로가 더 큰 움직임은 무시) → Task 4 테스트
- 월간에서 다른 달로 넘긴 뒤 남은 옛 `selectedDate`로 엉뚱한 주가 열리면 안 된다 → Task 5 테스트

---

### Task 1: 주 계산 순수 함수 + TZ 덮어쓰기 허용

**Files:**
- Modify: `mobile/jest.config.js:2` — `process.env.TZ = "Asia/Seoul";` → `process.env.TZ ||= "Asia/Seoul";` (주석에 "TZ=America/New_York npx jest로 음수 오프셋 검증 가능" 추가). 지금은 덮어써서 TZ 지정이 무시된다.
- Create: `mobile/src/calendar/weekRange.ts`
- Test: `mobile/src/calendar/__tests__/weekRange.test.ts`

**Interfaces:**
- Produces:
  - `type VisibleMonth = { year: number; month: number }` (month 1~12, `CalendarScreen`의 기존 타입을 여기로 옮겨 export)
  - `getWeekStartKey(dateKey: string): string` — 그 날짜가 든 주의 일요일 키
  - `shiftWeekKey(weekStartKey: string, weeks: number): string`
  - `getWeekDateKeys(weekStartKey: string): string[]` — 길이 7
  - `toWeekRange(weekStartKey: string): { range: { start: string; end: string }; startKey: string; endKeyExclusive: string }` — 로컬 일요일 0시 ~ 다음 일요일 0시, `toISOString()`
  - `formatWeekLabel(weekStartKey: string, today: Date): string`
  - `weekStartForMonthToWeek(args: { selectedDate: string | null; visibleMonth: VisibleMonth; today: Date }): string`
  - `monthForWeekToMonth(weekStartKey: string, today: Date): VisibleMonth`

- [ ] **Step 1: Write the failing tests** (`weekRange.test.ts`)
  - `getWeekStartKey("2026-11-27")` → `"2026-11-22"`; 일요일 자체 `"2026-11-22"` → `"2026-11-22"`; `"2027-01-01"` → `"2026-12-27"`
  - `getWeekDateKeys("2026-11-29")` → `["2026-11-29","2026-11-30","2026-12-01",…,"2026-12-05"]`
  - 서머타임: `getWeekDateKeys("2026-03-08")`·`getWeekDateKeys("2026-11-01")` 각각 7개 연속 날짜(중복·누락 없음)
  - `shiftWeekKey("2026-12-27", 1)` → `"2027-01-03"`, `shiftWeekKey("2026-11-01", -1)` → `"2026-10-25"`
  - `toWeekRange("2026-11-22").range` → `{ start: new Date(2026,10,22).toISOString(), end: new Date(2026,10,29).toISOString() }`, `endKeyExclusive` `"2026-11-29"`
  - `formatWeekLabel`: `"2026-11-22"` → `"11월 22일 – 28일"`; `"2026-11-29"` → `"11월 29일 – 12월 5일"`; today=2026-11-28일 때 `"2026-12-27"` → `"12월 27일 – 1월 2일"`; today=2026-11-28일 때 `"2027-03-07"` → `"2027년 3월 7일 – 13일"`(시작 연도가 오늘의 연도와 다르면 앞에 연도)
  - `weekStartForMonthToWeek`(today=`new Date(2026,10,28,12)`):
    - selectedDate `"2026-11-10"`, visibleMonth 2026-11 → `"2026-11-08"`
    - selectedDate `"2026-10-15"`, visibleMonth 2026-12 → 옛 선택 무시, 12월은 이번 달 아님 → 12/1이 든 주 `"2026-11-29"`
    - selectedDate null, visibleMonth 2026-11 → 이번 주 `"2026-11-22"`
  - `monthForWeekToMonth`(today=2026-11-28): `"2026-11-22"` → `{2026,11}`; `"2026-11-29"`(오늘 없음, 일요일이 11월) → `{2026,11}`; today=`new Date(2026,11,2)`일 때 `"2026-11-29"` → 오늘이 든 주라 `{2026,12}`

- [ ] **Step 2: Run to verify it fails** — `cd mobile && npx jest src/calendar/__tests__/weekRange.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: Implement `mobile/src/calendar/weekRange.ts`** — 모든 계산은 `parseLocalDateOnly` → `setDate`/`getDay` → `toDateKey`. 날짜 구분자는 en dash `–` 앞뒤 공백.

- [ ] **Step 4: Run to verify it passes** — 위 명령 + `TZ=America/New_York` 버전 둘 다 PASS. 그다음 `npx jest`(전체)로 jest.config 변경 회귀 없음 확인.

- [ ] **Step 5: Commit** — `git add mobile/jest.config.js mobile/src/calendar` / `git commit -m "feat(mobile): 캘린더 주간 보기용 주 계산 함수"`

### Task 2: 하루 칩 목록 순수 함수

**Files:**
- Create: `mobile/src/calendar/weekDayItems.ts`
- Test: `mobile/src/calendar/__tests__/weekDayItems.test.ts`

**Interfaces:**
- Consumes: `Todo`(`@tododo/core`), `GoogleCalendarEvent`(`@tododo/core/dist/calendarSync/index.js`), `isTodoOverdue`(`shared/utils/due`), `toDateKeyFromISO`
- Produces:
  - `interface WeekDayItem { key: string; title: string; dotColor: string; muted: boolean; kind: "todo" | "google" }`
  - `buildWeekDayItems(dateKey: string, todos: Todo[], googleEvents: GoogleCalendarEvent[]): WeekDayItem[]` — `todos`·`googleEvents`는 호출자가 이미 그날 것으로 거른 목록

- [ ] **Step 1: Write the failing tests** (시스템 시간 `jest.useFakeTimers({ now: new Date(2026, 10, 28, 12) })`, 픽스처 날짜는 `new Date(2026, 10, d, h).toISOString()`)
  - 순서: [완료 A, 구글 G, doing B, todo C, 기한초과(마감 11/26) D] 입력, dateKey `"2026-11-26"` → 제목 순서 `[D, C, B, G, A]`
  - 기간 할 일 E(start 11/24, due 11/26, status todo, 기한 지남): dateKey `"2026-11-24"` → dotColor `statusColors.todo.main`; `"2026-11-26"` → `colors.danger.main`
  - 같은 그룹 안: dueAt 이른 것 먼저, dueAt 없으면 뒤에서 제목 `localeCompare("ko")` 순
  - 완료·구글 `muted: true`, 나머지 false. 구글 dotColor `colors.text.tertiary`, 완료 `statusColors.done.main`
  - key: 할 일은 `todo-${id}`, 구글은 `google-${id}`

- [ ] **Step 2: Run to verify it fails** — `npx jest src/calendar/__tests__/weekDayItems.test.ts` → FAIL

- [ ] **Step 3: Implement** — 그룹 순위: overdue-on-due-day 0, todo 1, doing 2, google 3, done 4. overdue-on-due-day = `isTodoOverdue(todo) && todo.dueAt && toDateKeyFromISO(todo.dueAt) === dateKey`.

- [ ] **Step 4: Run to verify it passes** — 기본 + NY 둘 다 PASS

- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): 주간 하루 줄 칩 목록(정렬·색)"`

### Task 3: 하루 줄 컴포넌트(`WeekDayRow`) + 넘침 `+n`

**Files:**
- Create: `mobile/src/calendar/components/WeekDayRow.tsx`, `mobile/src/calendar/visibleChipCount.ts`
- Test: `mobile/src/calendar/__tests__/visibleChipCount.test.ts`, `mobile/src/calendar/__tests__/WeekDayRow.test.tsx`

**Interfaces:**
- Consumes: `WeekDayItem`(Task 2)
- Produces:
  - `countVisibleChips(chipBottoms: number[], containerHeight: number): number` — 각 칩의 (y+height)와 컨테이너 높이로 보일 개수. 모두 들어가면 전체, 넘치면 `max(1, 들어가는 개수 - 1)`(`+n` 자리 확보)
  - `WeekDayRow` props: `{ dateKey: string; items: WeekDayItem[]; isToday: boolean; isSelected: boolean; onPress: (dateKey: string) => void }`
  - testID: 줄 `week-row-${dateKey}`, 칩 `week-chip-${item.key}`, 넘침 `week-more-${dateKey}`

- [ ] **Step 1: Write failing tests**
  - `countVisibleChips([20,20,44,44,68], 70)` → 5(다 들어감); `countVisibleChips([20,20,44,44,68,68], 50)` → 3(4개 들어가지만 +n 자리로 1개 뺌); `countVisibleChips([20,44], 10)` → 1; `countVisibleChips([], 70)` → 0
  - `WeekDayRow`: 왼쪽에 `"월"`·`"24"`(dateKey `"2026-11-23"`이 아니라 `"2026-11-24"`면 월요일) 표시; 칩 제목 렌더; 줄 누르면 `onPress("2026-11-24")`; 컨테이너·칩에 `fireEvent(…, "layout", { nativeEvent: { layout: { y, height } } })`를 넣어 넘치게 하면 `week-more-…` 텍스트 `"+3"` 같은 남은 개수, 넘친 칩은 렌더하지 않음(측정 전 첫 렌더는 전부 그림)
  - 접근성 라벨: `"11월 24일 월요일, 할 일 2개, 구글 일정 1개"`; `isSelected`면 `accessibilityState.selected` true

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement** — 칩: 점(6pt 원) + 제목 `numberOfLines={1}`, 최대 폭 100%; 칩 컨테이너 `flexDirection:"row", flexWrap:"wrap", overflow:"hidden", flex:1`. 측정은 칩 onLayout(y+height) 배열과 컨테이너 onLayout height로 `countVisibleChips`. 오늘이면 요일·날짜 `colors.brand.strong`, 선택이면 날짜 숫자에 브랜드색 원(흰 글자, 월간 `CalendarDayCell`과 같은 28pt). 줄 사이 `StyleSheet.hairlineWidth` 위 테두리 `colors.border.tertiary`.

- [ ] **Step 4: Run to verify they pass** (기본 + NY)

- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): 주간 하루 줄 컴포넌트와 넘침 +n"`

### Task 4: 주간 본문·헤더·전환 버튼

**Files:**
- Create: `mobile/src/calendar/components/WeekRowsView.tsx`, `mobile/src/calendar/components/WeekHeader.tsx`, `mobile/src/calendar/components/ViewModeToggle.tsx`, `mobile/src/calendar/swipe.ts`
- Test: `mobile/src/calendar/__tests__/swipe.test.ts`, `mobile/src/calendar/__tests__/WeekViews.test.tsx`

**Interfaces:**
- Consumes: Task 1 `getWeekDateKeys`, `formatWeekLabel`; Task 3 `WeekDayRow`; Task 2 `WeekDayItem`
- Produces:
  - `type CalendarViewMode = "month" | "week"`
  - `ViewModeToggle` props `{ mode: CalendarViewMode; onChange: (mode: CalendarViewMode) => void }` — 버튼 텍스트 `"월간"`·`"주간"`, `accessibilityRole="button"`, `accessibilityState={{ selected }}`, testID `view-mode-month`/`view-mode-week`
  - `WeekHeader` props `{ label: string; onPrev: () => void; onNext: () => void; onToday: () => void }` — 라벨 `"이전 주"`/`"다음 주"`/`"오늘"`
  - `swipeDirection(dx: number, dy: number): -1 | 0 | 1` — `|dx| >= 50 && |dx| > |dy|`이면 dx<0 → 1(다음 주), dx>0 → -1, 아니면 0
  - `WeekRowsView` props `{ weekStartKey: string; itemsByDate: Record<string, WeekDayItem[]>; todayKey: string; selectedDate: string | null; onPressDate: (dateKey: string) => void; onSwipeWeek: (delta: -1 | 1) => void }` — 7개 `WeekDayRow`를 `flex:1`로 세로 배치, `PanResponder`의 `onMoveShouldSetPanResponder`는 `swipeDirection !== 0`일 때만 true, `onPanResponderRelease`에서 `onSwipeWeek`

- [ ] **Step 1: Write failing tests**
  - `swipeDirection(-60, 10)` → 1; `(60, 10)` → -1; `(-40, 0)` → 0; `(-60, 80)` → 0
  - `ViewModeToggle`: `"주간"` 누르면 `onChange("week")`; 현재 모드 버튼 `accessibilityState.selected` true
  - `WeekHeader`: 라벨 표시, 세 버튼 각각 콜백
  - `WeekRowsView`(weekStartKey `"2026-11-22"`): `week-row-2026-11-22`~`week-row-2026-11-28` 7개, 줄 누르면 `onPressDate`, `itemsByDate`의 칩이 해당 줄에 보임

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement** — 스타일은 기존 `InsightsFilterBar`의 선택 버튼, `WeekStrip`의 화살표 버튼(`lucide-react-native` `ChevronLeft`/`ChevronRight`) 모양을 따른다.

- [ ] **Step 4: Run to verify they pass** (기본 + NY)

- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): 주간 본문·주 헤더·월간/주간 전환 버튼"`

### Task 5: `CalendarScreen` 통합

**Files:**
- Modify: `mobile/src/screens/CalendarScreen.tsx` (전체 구조: 상태·조회 범위·렌더 분기)
- Test: `mobile/src/screens/__tests__/CalendarScreen.test.tsx` (기존 테스트 유지 + 추가)

**Interfaces:**
- Consumes: Task 1~4 전부. `VisibleMonth`는 Task 1에서 import(화면 내부 정의 삭제)
- Produces: 없음(화면)

동작(스펙 4-1~4-5):
- 상태: `mode`(초기 `"month"`), `weekStartKey`(초기 `getWeekStartKey(toDateKey(new Date()))`), 기존 `visibleMonth`·`selectedDate`·`isSheetOpen`
- 조회 범위: `mode==="week"`이면 `toWeekRange(weekStartKey)`, 아니면 기존 `toMonthRange(visibleMonth)` → `useGoogleCalendarEvents(range)`
- 주간 `itemsByDate`: 각 `getWeekDateKeys(weekStartKey)`에 대해 `buildWeekDayItems(key, getTodosForDate(key), overlayEvents.filter((e) => isDateInGoogleEventRange(key, e)))`
- 월간 → 주간: `setWeekStartKey(weekStartForMonthToWeek({ selectedDate, visibleMonth, today: new Date() }))`; 주간 → 월간: `setVisibleMonth(monthForWeekToMonth(weekStartKey, new Date()))` — `Calendar initialDate`가 `monthRange.startKey`라 그 달로 그려진다
- 레이아웃 순서: `CalendarConnectionBar` → `ViewModeToggle` → (주간이면 `WeekHeader` + `WeekRowsView`(flex:1) / 월간이면 기존 `calendarArea`)
- 줄 누르기·시트·추가·상세 이동은 기존 핸들러 재사용(`handleDayPress`의 dateString 대신 dateKey를 받는 공용 `openDate(dateKey)`로 정리)

- [ ] **Step 1: Write failing tests** (기존 스텁·`now: new Date(2026, 5, 15, 12)` 유지)
  - `view-mode-week` 누르면 `week-row-2026-06-14`~`week-row-2026-06-20` 표시, 헤더 `"6월 14일 – 20일"`
  - 주간에서 `useGoogleCalendarEvents`가 `{ start: new Date(2026,5,14).toISOString(), end: new Date(2026,5,21).toISOString() }`로 불림
  - 할 일(dueAt `new Date(2026,5,16,10).toISOString()`, 제목 "주간 제목") → `week-row-2026-06-16` 안에 "주간 제목"
  - `"다음 주"` → `week-row-2026-06-21`; `"오늘"` → 다시 `week-row-2026-06-14`
  - 줄 `week-row-2026-06-16` 누르면 날짜 시트가 "6월 16일" 라벨로 열림(기존 시트 테스트와 같은 확인 방식)
  - 월간에서 `calendar-day-2026-06-20` 눌러 선택 → 시트 닫고 `view-mode-week` → `week-row-2026-06-20`이 든 주(`2026-06-14`) + 그 줄 `accessibilityState.selected`
  - 옛 선택 무시: 6/20 선택 → `calendar-next-month`(7월) → `view-mode-week` → 7/1이 든 주(`week-row-2026-06-28`)
  - 주간에서 `"다음 주"` 3번(7/5 주) → `view-mode-month` → `calendar-visible-month`가 `"2026-07"`
  - 기존 월간 테스트 전부 그대로 통과

- [ ] **Step 2: Run to verify they fail** — `npx jest src/screens/__tests__/CalendarScreen.test.tsx`

- [ ] **Step 3: Implement** (위 동작대로)

- [ ] **Step 4: Run to verify** — 이 파일 기본+NY PASS, 이어서 `cd mobile && npx jest && TZ=America/New_York npx jest && npx tsc --noEmit` 전부 통과

- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): 캘린더 탭 월간/주간 전환 연결"`

### Task 6: 화면 확인 + PR

- [ ] **Step 1:** 시뮬레이터(iPhone 18 Pro, dev client)로 캘린더 탭 진입 화면 스크린샷을 남긴다. GUI가 없어 탭·스와이프는 못 하므로, 가능하면 임시로 `mode` 초기값을 `"week"`로 바꾼 번들로 주간 화면 스크린샷만 찍고 **되돌린다**(커밋 금지). 불가하면 생략하고 PR에 적는다.
- [ ] **Step 2:** `git push -u origin feat/mobile-calendar-week-view`, `gh pr create --base develop` — 본문: 스펙·계획 링크, 사용자 결정(C안, (가)안), 설계 판단 목록, 테스트 결과(기본/NY), 실기기 확인 항목(스와이프, 작은 기기 +n, 주간↔월간 이동). 병합하지 않는다.
- [ ] **Step 3:** tododo-88에 PR 번호·테스트 결과 보고.

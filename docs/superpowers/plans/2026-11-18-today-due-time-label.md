# 오늘 화면 마감 시각·남은 시간 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 화면(웹·앱)의 마감 배지가 당일이면 `3시간 남음`/`2시간 지남`, 1~3일이면 `D-1 · 14:30`을 보여 주고, 시각 표기를 24시간제 `HH:mm`으로 바꾼다.

**Architecture:** 라벨 계산은 `now`를 인자로 받는 순수 함수(`due.ts`)로 두고, 화면은 모듈 단위로 공유되는 1분 타이머 훅(`useMinuteNow`, `useSyncExternalStore`)에서 `now`를 받는다. 행마다 타이머를 만들지 않고 구독자가 0이 되면 interval을 정리한다. 웹과 앱은 기존처럼 같은 로직을 각자 복제해 둔다.

**Tech Stack:** React 19 + styled-components + Vitest(웹), React Native + Jest + @testing-library/react-native(앱)

**Spec:** `docs/superpowers/specs/2026-11-18-today-due-time-label-design.md`

## Global Constraints

- 시각 표기: 24시간제 `HH:mm` (두 자리 0 채움, 예 `09:05`, `14:30`). 자정(로컬 00:00)이면 시각 없음(null).
- 당일 마감 문구: 남은 시간 `N분 남음`(60분 미만) / `N시간 남음`, 지난 시간 `N분 지남`(60분 미만) / `N시간 지남`.
- 1~3일: `D-N · HH:mm`, 시각이 없으면 `D-N`. 당일인데 시각이 없으면 `D-day`. 하루 이상 지남: `N일 초과`(변경 없음).
- 구분자는 공백·가운뎃점·공백 `" · "` (U+00B7).
- 긴급도 색상(`getUrgency`)과 기준(`DUE_SOON_DAYS = 3`)은 바꾸지 않는다.
- 테스트는 시스템 시간 mock으로 고정하고 로컬 생성자 `new Date(y, m, d, h, mi)`로 픽스처를 만든다. UTC `Z` 리터럴로 시각을 고정하지 말 것.
- 서브에이전트는 git hooks 우회(`--no-verify`) 금지.

## Review Focus

1. 날짜 경계: 23:30에 다음 날 00:30 마감이면 1시간 뒤라도 `D-1 · 00:30`이다(시간 단위는 당일만). → Task 1 테스트
2. 화면을 켜 둔 채 마감 시각이 지나면 `1분 남음` → `1분 지남`으로 바뀐다(1분 tick). → Task 2·4 테스트
3. 자정이 지나면 어제 23:00 마감은 `N시간 지남`이 아니라 `1일 초과`다. → Task 1 테스트
4. 마지막 구독자가 unmount되면 interval이 남지 않는다. → Task 2·4 테스트
5. 정확히 마감 순간(남은 0ms)과 30초 남음: 0ms는 `1분 지남`, 30초 남음은 `1분 남음`(남은 분은 올림, 지난 분은 내림하되 최소 1). → Task 1 테스트

---

### Task 1: 웹 라벨 계산 함수

**Files:**
- Modify: `client/src/shared/utils/due.ts` (`getDaysLeft`에 `now` 인자, `getDueLabel` 추가)
- Modify: `client/src/shared/utils/formatToday.ts` (`formatDueTime` → `HH:mm`, 주석 갱신)
- Modify: `client/src/shared/utils/index.ts` (`getDueLabel` export)
- Test: `client/src/shared/utils/__tests__/due.test.ts`, `client/src/shared/utils/__tests__/formatToday.test.ts`

**Interfaces:**
- Produces:
  - `getDaysLeft(dueAt: string, now: Date = new Date()): number` — 기존 호출부는 인자 없이 그대로 동작
  - `formatDueTime(dueAt: string): string | null` — `"14:30"`, 자정이면 `null`
  - `getDueLabel(dueAt: string, now: Date): string` — 긴급(danger/soon) 배지 문구

- [ ] **Step 1: formatDueTime 테스트를 새 형식으로 고친다** — 기존 기대값 교체: 9:00→`'09:00'`, 14:00→`'14:00'`, 12:00→`'12:00'`, 18:30→`'18:30'`(“분 단위가 있어도 시 단위로만” 테스트는 “분까지 표시” 로 바꾼다), 9:05→`'09:05'`, 자정→`null` 유지.

- [ ] **Step 2: getDueLabel 테스트를 쓴다** (`vi.setSystemTime(new Date(2026, 5, 15, 12, 0))`, `now = new Date()`):

```ts
const at = (d: number, h: number, mi = 0, s = 0) => new Date(2026, 5, d, h, mi, s).toISOString()
expect(getDueLabel(at(15, 15), now)).toBe('3시간 남음')
expect(getDueLabel(at(15, 12, 40), now)).toBe('40분 남음')
expect(getDueLabel(at(15, 12, 59, 59), now)).toBe('1시간 남음')   // 남은 분 올림 → 60분
expect(getDueLabel(at(15, 12, 0, 30), now)).toBe('1분 남음')
expect(getDueLabel(at(15, 12, 0), now)).toBe('1분 지남')          // 정확히 마감 순간
expect(getDueLabel(at(15, 11, 20), now)).toBe('40분 지남')
expect(getDueLabel(at(15, 9, 30), now)).toBe('2시간 지남')        // 2.5시간 → 내림
expect(getDueLabel(at(15, 0), now)).toBe('D-day')                 // 당일 자정 = 시각 없음
expect(getDueLabel(at(16, 14, 30), now)).toBe('D-1 · 14:30')
expect(getDueLabel(at(18, 0), now)).toBe('D-3')
expect(getDueLabel(at(13, 9), now)).toBe('2일 초과')
// Review Focus 1: 23:30 기준 다음 날 00:30
expect(getDueLabel(at(16, 0, 30), new Date(2026, 5, 15, 23, 30))).toBe('D-1 · 00:30')
// Review Focus 3: 00:10 기준 어제 23:00
expect(getDueLabel(at(14, 23), new Date(2026, 5, 15, 0, 10))).toBe('1일 초과')
```

  `getDaysLeft(at(16, 1), new Date(2026, 5, 15, 23, 59))`가 `1`인 테스트도 추가한다.

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/shared/utils/__tests__/due.test.ts src/shared/utils/__tests__/formatToday.test.ts` / Expected: FAIL (`getDueLabel` is not a function, formatDueTime 기대값 불일치)

- [ ] **Step 4: 구현** — `getDaysLeft`는 `new Date()` 대신 `now`의 복사본에 `setHours(0,0,0,0)`. `getDueLabel`: `daysLeft < 0` 또는 `> 0`은 `getDueBadgeLabel(daysLeft)`에 `formatDueTime`이 있으면 `" · " + time`을 붙이되 초과(`< 0`)에는 붙이지 않는다. `daysLeft === 0`이면 시각이 null일 때 `D-day`, 아니면 `diff = due - now`: `diff > 0`이면 `m = ceil(diff/60000)`, `diff <= 0`이면 `m = max(1, floor(-diff/60000))`. `m < 60`이면 `${m}분`, 아니면 `${floor(m/60)}시간`, 뒤에 `남음`/`지남`.

- [ ] **Step 5: 통과 확인** — 같은 명령, Expected: PASS. 이어서 `TZ=America/New_York npx vitest run src/shared/utils` 도 PASS.

- [ ] **Step 6: Commit** — `feat(today): 마감 라벨 계산(남은/지난 시간, D-n · HH:mm) 추가`

### Task 2: 웹 1분 타이머 훅 + 오늘 화면 적용

**Files:**
- Create: `client/src/shared/hooks/useMinuteNow.ts`
- Modify: `client/src/shared/hooks/index.ts` (export)
- Modify: `client/src/features/today/components/todayTodoItem.tsx` (배지 문구를 `getDueLabel`로)
- Modify: `client/src/features/today/components/todayTodoItem.styles.tsx` (`OverdueBadge`·`DueSoonBadge`·`TimeLabel`에 `white-space: nowrap`)
- Test: `client/src/shared/hooks/__tests__/useMinuteNow.test.ts`, `client/src/features/today/components/__tests__/todayTodoItem.test.tsx`

**Interfaces:**
- Consumes: `getDueLabel`, `getDaysLeft(dueAt, now)`, `formatDueTime` (Task 1)
- Produces: `useMinuteNow(): Date` — 모든 구독자가 하나의 `setInterval(60_000)`을 공유, 구독자 0이면 `clearInterval`. `useSyncExternalStore`로 구현하고 snapshot은 tick 때만 바뀌는 같은 `Date` 객체(매 렌더 새 객체 금지 — 무한 렌더).

- [ ] **Step 1: 훅 테스트** — `renderHook` 2개를 띄우면 `vi.getTimerCount() === 1`; `vi.advanceTimersByTime(60_000)` 후 반환값이 1분 증가; 둘 다 unmount하면 `vi.getTimerCount() === 0` (Review Focus 4).
- [ ] **Step 2: TodayTodoItem 테스트 추가** (`vi.setSystemTime(new Date(2026, 5, 15, 12, 0))`, 픽스처는 로컬 생성자):
  - 오늘 15:00 마감 → `screen.getByText('3시간 남음')`
  - 내일 14:30 마감 → `'D-1 · 14:30'`
  - 6일 뒤 09:05 마감 → `'09:05'` (기존 TimeLabel 자리)
  - 오늘 12:00:30 마감 렌더 후 `act(() => vi.advanceTimersByTime(60_000))` → `'1분 남음'`이 `'1분 지남'`으로 바뀐다 (Review Focus 2)
  - 기존 `'2일 초과'` 테스트는 그대로 통과해야 한다. 기존 `beforeEach`의 UTC 리터럴 `setSystemTime`은 새 테스트 describe에서 로컬 생성자로 덮어쓴다.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/shared/hooks/__tests__/useMinuteNow.test.ts src/features/today/components/__tests__/todayTodoItem.test.tsx` → FAIL
- [ ] **Step 4: 구현** — `todayTodoItem.tsx`에서 `const now = useMinuteNow()`, `daysLeft = getDaysLeft(todo.dueAt, now)`, 긴급 배지 두 곳의 `getDueBadgeLabel(daysLeft)`를 `getDueLabel(todo.dueAt, now)`로. 기간 항목의 "마지막 날 아님" 분기(`getDueBadgeLabel`)는 그대로.
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, 그리고 `npx vitest run src/features/today src/features/guest` PASS.
- [ ] **Step 6: Commit** — `feat(today): 오늘 화면 마감 배지에 남은 시간·시각 표시(웹)`

### Task 3: 앱 라벨 계산 함수

**Files:**
- Modify: `mobile/src/shared/utils/due.ts`, `mobile/src/shared/utils/formatToday.ts`
- Test: `mobile/src/shared/utils/__tests__/due.test.ts`, `mobile/src/shared/utils/__tests__/formatToday.test.ts`

**Interfaces:**
- Produces: Task 1과 같은 시그니처 — `getDaysLeft(dueAt, now = new Date())`, `formatDueTime(dueAt): string | null`(`HH:mm`), `getDueLabel(dueAt, now): string`

- [ ] **Step 1: 테스트** — Task 1 Step 1·2의 기대값을 Jest 문법(`jest.useFakeTimers(); jest.setSystemTime(...)`)으로 그대로 옮긴다.
- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/shared/utils/__tests__/due.test.ts src/shared/utils/__tests__/formatToday.test.ts` → FAIL
- [ ] **Step 3: 구현** — Task 1 Step 4와 같은 규칙. 파일 상단 "웹 로직 포팅" 주석 유지.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `TZ=America/New_York npx jest src/shared/utils` PASS.
- [ ] **Step 5: Commit** — `feat(mobile): 마감 라벨 계산(남은/지난 시간, D-n · HH:mm) 추가`

### Task 4: 앱 1분 타이머 훅 + 오늘 화면 적용

**Files:**
- Create: `mobile/src/hooks/useMinuteNow.ts`
- Modify: `mobile/src/shared/ui/dueBadge/DueBadge.tsx` (prop `daysLeft: number` → `label: string`)
- Modify: `mobile/src/shared/ui/todayTodoItem/TodayTodoItem.tsx`
- Test: `mobile/src/hooks/__tests__/useMinuteNow.test.ts`, `mobile/src/shared/ui/todayTodoItem/__tests__/TodayTodoItem.test.tsx`

**Interfaces:**
- Consumes: Task 3 함수들
- Produces: `useMinuteNow(): Date` (Task 2와 같은 계약), `DueBadge({ label, urgency, testID })`

- [ ] **Step 1: 테스트** — 훅: Task 2 Step 1과 같은 3개 단언(`jest.getTimerCount()`). TodayTodoItem: 기존 `setSystemTime(new Date(2026, 5, 15, 12, 0))` 기준으로 오늘 18:00 → `'6시간 남음'`, 6월 17일 18:00 → `'D-2 · 18:00'`(기존 `'D-2'` 단언을 교체), 6월 21일 09:05 → `'09:05'`, 오늘 12:00:30 마감 후 `act(() => jest.advanceTimersByTime(60_000))` → `'1분 지남'`. 기존 색상 단언은 그대로 통과해야 한다. `DateTodosSheet` 테스트도 그대로 통과해야 한다.
- [ ] **Step 2: 실패 확인** — `npx jest src/hooks/__tests__/useMinuteNow.test.ts src/shared/ui/todayTodoItem` → FAIL
- [ ] **Step 3: 구현** — Task 2 Step 4와 같은 교체. `DueBadge`는 받은 `label`을 그대로 렌더하고 `Text`에 `numberOfLines={1}`.
- [ ] **Step 4: 통과 확인** — `npx jest` 전체 PASS, `npx tsc --noEmit` 오류 0.
- [ ] **Step 5: Commit** — `feat(mobile): 오늘 화면 마감 배지에 남은 시간·시각 표시`

### Task 5: 전체 검증

- [ ] **Step 1:** `cd client && VITE_FIREBASE_API_KEY= npx vitest run` → 전부 PASS (CI 등가)
- [ ] **Step 2:** `cd client && TZ=America/New_York npx vitest run src/shared src/features/today` → PASS
- [ ] **Step 3:** `cd client && npx tsc -b && npm run lint` → 오류 0
- [ ] **Step 4:** `cd mobile && npx jest && npx tsc --noEmit` → PASS
- [ ] **Step 5:** 웹 dev 서버에서 오늘 화면을 열어 당일·내일·지남 항목 문구와 375px 폭에서 제목 말줄임·배지 한 줄 유지를 눈으로 확인(스크린샷).

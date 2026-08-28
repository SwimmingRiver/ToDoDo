# 모바일 캘린더 화면(CalendarScreen) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 앱의 캘린더 탭(현재 "캘린더는 준비 중입니다" 플레이스홀더)을 `react-native-calendars` 기반 월간 뷰로 교체하고, 날짜 탭 시 그 날의 할 일 목록/추가 진입점을 제공한다.

**Architecture:** 순수 마커 계산 함수(`calendarMarkers.ts`) → 데이터 훅(`useCalendarTodos.ts`, 기존 `useTodos()` 재사용) → 프레젠테이션 컴포넌트(`DateTodosSheet.tsx`, 날짜별 할 일 시트) → 화면 조립(`CalendarScreen.tsx`) → `RootNavigator`에 배선. 오늘 페이지(PR #103)가 이미 만든 `dateRange.ts`/`TodayTodoItem`/`EmptyState`/`ListSkeleton`을 그대로 재사용하고, 새 쿼리 훅이나 실시간 리스너는 추가하지 않는다.

**Tech Stack:** React Native(Expo 57) + TypeScript, `@tanstack/react-query`(기존 `useTodos()`), `react-native-calendars`(신규 의존성), `@testing-library/react-native@14`(Jest).

**Spec:** `docs/superpowers/specs/2026-08-27-mobile-today-calendar-design.md` (5절 캘린더 페이지, 6절 로딩/에러/빈 상태, 8절 스펙 리뷰 결정)

## Global Constraints

- `dueAt`/`startAt`은 UTC `Z` 문자열로 저장된다 — 날짜 추출 시 `split("T")[0]` 금지, 반드시 `toDateKeyFromISO`(로컬 변환)를 거친다.
- 반복 항목 전용 표시(배지·구분 색)는 이번 스코프에서 완전히 제외한다 — 상태/overdue 기준으로만 마커를 찍는다.
- 캘린더 드래그 리스케줄, 칸반 보드, Firestore 실시간 리스너, 주간 뷰 토글, 캘린더에서 직접 이벤트 생성은 스코프 밖이다.
- 빈 날짜를 탭해도 바텀시트(시트)는 항상 열고, 빈 상태에도 "할 일 추가" 버튼을 둔다.
- 모든 `Pressable`의 최소 터치 타겟은 44px(`MIN_TOUCH_TARGET`, `mobile/src/theme/spacing.ts`)다.
- `@testing-library/react-native@14`의 `render()`/`renderHook()`/`fireEvent.press`는 전부 async 함수다 — 반드시 `await`한다.
- RN `Modal`의 Jest 목(mock)은 `visible` prop이 false→true로 바뀔 때 한 틱 더 지나야 렌더링된다 — 직후 동기 조회 대신 `waitFor`/`findBy*`를 쓴다.
- `mobile/AGENTS.md`: Expo가 버전마다 API가 바뀌므로 Expo 고유 API를 건드릴 때는 먼저 https://docs.expo.dev/versions/v57.0.0/ 를 확인한다. (참고: 이번 계획이 쓰는 `react-native-calendars`는 Expo SDK 모듈이 아니라 순수 서드파티 RN 라이브러리라 이 규칙의 대상이 아니다 — Expo 자체의 `expo-calendar`(기기 캘린더 연동)와 혼동하지 않는다.)

---

## 1. 배경 확인 (실행 전 참고, 별도 태스크 아님)

- `mobile/src/screens/CalendarPlaceholderScreen.tsx`가 현재 캘린더 탭에 배선되어 있다(`mobile/src/navigation/RootNavigator.tsx:12,39`).
- `mobile/src/shared/utils/dateRange.ts`에 `toDateKey`/`toDateKeyFromISO`/`parseLocalDateOnly`/`isDateInTodoRange`/`getPeriodProgress`가 이미 있다(오늘 페이지 작업에서 만들어짐). 이번 계획은 여기에 날짜 범위 전개 함수 하나만 추가한다.
- 스펙 5절은 "기존 `BottomSheet` 컴포넌트 재사용"이라 적었지만, 실제 `mobile/src/shared/ui/bottomSheet/BottomSheet.tsx`는 `options: {value,label,icon}[]` 단일 선택 리스트 전용이라(상태 변경 시트에서만 쓰임) 할 일 목록+추가 버튼을 담을 수 없다. 이번 계획은 `BottomSheet`를 억지로 재사용하지 않고, 같은 시각 언어(Modal + slide + overlay + handle)를 쓰는 새 컴포넌트 `DateTodosSheet`를 만든다.
- `react-native-calendars`는 아직 `mobile/package.json`에 없다. 최신 버전(`1.1314.0`, peerDependencies 없음)은 `main: "src/index.ts"`로 **미컴파일 TypeScript 원본**을 그대로 배포한다 — Jest 기본 `transformIgnorePatterns`(`node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)`)가 이 패키지를 걸러주지 않아 `Unexpected token`류 파싱 에러가 난다. Task 1에서 `mobile/jest.config.js`의 `transformIgnorePatterns`를 확장해야 한다. 반면 `react-native-calendars`가 의존하는 `react-native-swipe-gestures`/`recyclerlistview`는 이미 컴파일된 CJS를 배포하므로 추가 조치가 필요 없다.

---

### Task 1: `react-native-calendars` 의존성 추가 + Jest 변환 설정 + CalendarScreen 스켈레톤

**Files:**
- Modify: `mobile/package.json` (dependencies)
- Modify: `mobile/jest.config.js`
- Create: `mobile/src/screens/CalendarScreen.tsx`
- Test: `mobile/src/screens/__tests__/CalendarScreen.test.tsx`

**Interfaces:**
- Produces: `CalendarScreen`(default내보내기 아님, named export) — Task 5에서 이 파일에 로직을 이어서 채운다.

- [ ] **Step 1: 의존성 추가 + 설치**

`mobile/package.json`의 `dependencies`에 추가(알파벳 순서 유지):

```json
    "react-native-calendars": "^1.1314.0",
```

`"react-native"` 항목과 `"react-native-safe-area-context"` 항목 사이에 들어간다.

Run: `cd mobile && npm install`

- [ ] **Step 2: Jest transformIgnorePatterns 확장**

`mobile/jest.config.js`를 다음으로 교체한다(기존 `moduleNameMapper` 유지, `transformIgnorePatterns` 추가):

```js
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  // jest-expo(@react-native/jest-preset)는 customExportConditions에 "react-native"를
  // 포함시킨다. lucide-react-native의 package.json exports는 "react-native" 조건을
  // ESM(.mjs) 번들로 매핑해 두어서, 테스트 환경에서 그대로 두면
  // "Unexpected token 'export'" 파싱 에러가 난다. CJS 번들로 직접 리다이렉트한다.
  moduleNameMapper: {
    "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  // react-native-calendars는 package.json의 main이 "src/index.ts"라 미컴파일 TS
  // 원본을 그대로 배포한다. 기본 transformIgnorePatterns(react-native 계열만 허용)가
  // 이 패키지를 걸러주지 않으면 "Unexpected token" 파싱 에러가 난다.
  transformIgnorePatterns: ["node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-calendars)/)"],
};
```

- [ ] **Step 3: CalendarScreen 스켈레톤 작성**

`mobile/src/screens/CalendarScreen.tsx`:

```tsx
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { colors } from "../theme/colors";

/**
 * 캘린더 탭. Task 5에서 마커/날짜 탭 인터랙션을 채운다.
 * react-native-calendars의 `Calendar`(월간 뷰)만 우선 렌더링해 의존성 로딩을 검증한다.
 */
export const CalendarScreen = () => (
  <SafeAreaView style={styles.screen} edges={[]}>
    <Calendar />
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
});
```

- [ ] **Step 4: 스모크 테스트 작성**

`mobile/src/screens/__tests__/CalendarScreen.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";

describe("CalendarScreen", () => {
  it("react-native-calendars의 Calendar를 오류 없이 렌더링한다", async () => {
    const { CalendarScreen } = await import("../CalendarScreen");
    const result = await render(<CalendarScreen />);
    expect(result.toJSON()).toBeTruthy();
  });
});
```

- [ ] **Step 5: 테스트 실행**

Run: `cd mobile && npx jest src/screens/__tests__/CalendarScreen.test.tsx`
Expected: PASS. 실패한다면 `transformIgnorePatterns` 정규식이 `react-native-calendars`를 실제로 매치하는지부터 확인한다(Step 2).

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/jest.config.js mobile/src/screens/CalendarScreen.tsx mobile/src/screens/__tests__/CalendarScreen.test.tsx
git commit -m "feat(mobile): react-native-calendars 의존성 추가 + CalendarScreen 스켈레톤"
```

---

### Task 2: 캘린더 마커 계산 순수 함수 (`calendarMarkers.ts`)

**Files:**
- Modify: `mobile/src/shared/utils/dateRange.ts` (범위 전개 헬퍼 추가)
- Create: `mobile/src/shared/utils/calendarMarkers.ts`
- Test: `mobile/src/shared/utils/__tests__/calendarMarkers.test.ts`

**Interfaces:**
- Consumes: `dateRange.ts`의 `toDateKey`, `toDateKeyFromISO`, `parseLocalDateOnly`(기존) + `getDateKeysInRange`(신규, 이 태스크에서 추가)
- Consumes: `due.ts`의 `isTodoOverdue(todo: {dueAt: string|null; status: string}): boolean`(기존)
- Consumes: `theme/statusColors.ts`의 `statusColors`, `theme/colors.ts`의 `colors.danger.main`(기존)
- Produces: `CalendarDot { key: string; color: string }`, `CalendarMarkedDates = Record<string, { dots: CalendarDot[]; selected?: boolean }>`, `buildCalendarMarkedDates(todos: Todo[]): CalendarMarkedDates` — Task 3(`useCalendarTodos`)과 Task 5(`CalendarScreen`)가 그대로 가져다 쓴다.

- [ ] **Step 1: `getDateKeysInRange` 실패하는 테스트 작성**

`mobile/src/shared/utils/__tests__/dateRange.test.ts`의 `getStripDates` describe 블록 다음에 추가:

```ts
describe("getDateKeysInRange", () => {
  it("시작~끝 날짜(양 끝 포함)의 yyyy-MM-dd 키 배열을 반환한다", () => {
    expect(getDateKeysInRange("2026-06-14", "2026-06-16")).toEqual([
      "2026-06-14",
      "2026-06-15",
      "2026-06-16",
    ]);
  });

  it("시작과 끝이 같으면 하루짜리 배열을 반환한다", () => {
    expect(getDateKeysInRange("2026-06-14", "2026-06-14")).toEqual(["2026-06-14"]);
  });
});
```

이 파일 상단 import에 `getDateKeysInRange`를 추가한다:

```ts
import {
  toDateKey,
  parseLocalDateOnly,
  toDateKeyFromISO,
  isSameLocalDay,
  getStripDates,
  getDateKeysInRange,
  isDateInTodoRange,
  getPeriodProgress,
} from "../dateRange";
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest src/shared/utils/__tests__/dateRange.test.ts -t "getDateKeysInRange"`
Expected: FAIL — `getDateKeysInRange is not a function` 또는 `undefined`.

- [ ] **Step 3: `getDateKeysInRange` 구현**

`mobile/src/shared/utils/dateRange.ts`의 `getStripDates` 함수 바로 아래에 추가:

```ts
/** startKey부터 endKey까지(양 끝 포함, 로컬 "yyyy-MM-dd") 날짜 키 배열을 반환한다. */
export const getDateKeysInRange = (startKey: string, endKey: string): string[] => {
  const start = parseLocalDateOnly(startKey);
  const end = parseLocalDateOnly(endKey);
  const dayCount = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Array.from({ length: Math.max(dayCount, 0) }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toDateKey(d);
  });
};
```

`MS_PER_DAY`는 이미 파일 하단(`getPeriodProgress` 근처)에 정의돼 있다 — 그 상수 선언을 `getDateKeysInRange`보다 위(파일 상단, `STRIP_WINDOW_DAYS` 옆)로 옮긴다:

```ts
export const STRIP_WINDOW_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
```

그리고 파일 하단의 기존 `const MS_PER_DAY = ...` 줄은 삭제한다(중복 선언 방지).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/shared/utils/__tests__/dateRange.test.ts`
Expected: PASS (전체 파일).

- [ ] **Step 5: `calendarMarkers.ts` 실패하는 테스트 작성**

`mobile/src/shared/utils/__tests__/calendarMarkers.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { buildCalendarMarkedDates } from "../calendarMarkers";
import { statusColors } from "../../../theme/statusColors";
import { colors } from "../../../theme/colors";

// dateRange.test.ts와 동일한 이유(로컬 타임존 기준 UTC ISO 생성) + isTodoOverdue가
// new Date()를 참조하므로 시스템 시각을 고정한다(useTodayTodos.test.tsx와 동일 패턴).
const localISO = (y: number, m: number, d: number, h = 9): string =>
  new Date(y, m - 1, d, h).toISOString();

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: "id",
  userId: "u1",
  title: "title",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("buildCalendarMarkedDates", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("완료 항목만 있는 날짜는 마커에 포함하지 않는다", () => {
    const todos = [makeTodo({ dueAt: localISO(2026, 6, 20), status: "done" })];
    expect(buildCalendarMarkedDates(todos)).toEqual({});
  });

  it("dueAt만 있는 항목은 그 날짜 하루에만 상태색 점을 남긴다", () => {
    const todos = [makeTodo({ dueAt: localISO(2026, 6, 20), status: "doing" })];
    const marked = buildCalendarMarkedDates(todos);
    expect(Object.keys(marked)).toEqual(["2026-06-20"]);
    expect(marked["2026-06-20"].dots).toEqual([{ key: "doing", color: statusColors.doing.main }]);
  });

  it("startAt~dueAt 구간의 모든 날짜에 점을 남긴다", () => {
    const todos = [
      makeTodo({ startAt: localISO(2026, 6, 20), dueAt: localISO(2026, 6, 22), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(Object.keys(marked).sort()).toEqual(["2026-06-20", "2026-06-21", "2026-06-22"]);
    expect(marked["2026-06-21"].dots).toEqual([{ key: "doing", color: statusColors.doing.main }]);
  });

  it("마감이 지난(overdue) 항목이 있으면 그 날짜는 danger 점 하나만 표시한다(다른 상태 무시)", () => {
    const todos = [
      // 2026-06-15가 오늘(시스템 시각 고정)이므로 06-10 dueAt은 overdue.
      makeTodo({ id: "overdue", dueAt: localISO(2026, 6, 10), status: "todo" }),
      // 같은 06-10을 포함하는 진행중(비overdue) 기간 항목.
      makeTodo({ id: "period", startAt: localISO(2026, 6, 9), dueAt: localISO(2026, 6, 11), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(marked["2026-06-10"].dots).toEqual([{ key: "overdue", color: colors.danger.main }]);
  });

  it("overdue 없이 서로 다른 상태의 항목이 겹치면 상태별 점을 todo→doing 순서로 각각 표시한다", () => {
    const todos = [
      makeTodo({ id: "a", dueAt: localISO(2026, 6, 20), status: "todo" }),
      makeTodo({ id: "b", startAt: localISO(2026, 6, 19), dueAt: localISO(2026, 6, 21), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(marked["2026-06-20"].dots).toEqual([
      { key: "todo", color: statusColors.todo.main },
      { key: "doing", color: statusColors.doing.main },
    ]);
  });

  it("startAt/dueAt이 모두 없는 항목은 무시한다", () => {
    const todos = [makeTodo({ startAt: null, dueAt: null, status: "todo" })];
    expect(buildCalendarMarkedDates(todos)).toEqual({});
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `cd mobile && npx jest src/shared/utils/__tests__/calendarMarkers.test.ts`
Expected: FAIL — `Cannot find module '../calendarMarkers'`.

- [ ] **Step 7: `calendarMarkers.ts` 구현**

`mobile/src/shared/utils/calendarMarkers.ts`:

```ts
import type { Todo } from "@tododo/core";
import { getDateKeysInRange, toDateKeyFromISO } from "./dateRange";
import { isTodoOverdue } from "./due";
import { statusColors } from "../../theme/statusColors";
import { colors } from "../../theme/colors";

export interface CalendarDot {
  key: string;
  color: string;
}

export type CalendarMarkedDates = Record<string, { dots: CalendarDot[]; selected?: boolean }>;

// "완료"는 애초에 마커 대상에서 제외되므로 todo/doing만 순서를 정의한다.
const DOT_ORDER = ["todo", "doing"] as const;

function getTodoDateKeys(todo: Todo): string[] {
  const startKey = todo.startAt ? toDateKeyFromISO(todo.startAt) : null;
  const dueKey = todo.dueAt ? toDateKeyFromISO(todo.dueAt) : null;
  if (startKey && dueKey) return getDateKeysInRange(startKey, dueKey);
  if (startKey) return [startKey];
  if (dueKey) return [dueKey];
  return [];
}

/**
 * 날짜별 캘린더 마커(react-native-calendars의 markingType="multi-dot" 입력)를 계산한다.
 * 정책(스펙 5절): overdue(마감 지났고 미완료)가 하나라도 있으면 그 날짜는 danger 점
 * 하나만 표시("위험 신호" 우선, 다른 상태는 그 날짜에서 숨겨진다). overdue가 없으면
 * 그 날짜에 걸친 미완료 상태들의 색을 todo→doing 순서로 각각 표시한다. 완료만 있는
 * 날짜는 마커를 아예 남기지 않는다.
 */
export function buildCalendarMarkedDates(todos: Todo[]): CalendarMarkedDates {
  const byDate = new Map<string, Map<string, string>>();

  for (const todo of todos) {
    if (todo.status === "done") continue;
    const overdue = isTodoOverdue(todo);
    const colorKey = overdue ? "overdue" : todo.status;
    const color = overdue ? colors.danger.main : statusColors[todo.status].main;

    for (const dateKey of getTodoDateKeys(todo)) {
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      byDate.get(dateKey)!.set(colorKey, color);
    }
  }

  const result: CalendarMarkedDates = {};
  for (const [dateKey, colorMap] of byDate) {
    if (colorMap.has("overdue")) {
      result[dateKey] = { dots: [{ key: "overdue", color: colorMap.get("overdue")! }] };
      continue;
    }
    const dots = DOT_ORDER.filter((key) => colorMap.has(key)).map((key) => ({
      key,
      color: colorMap.get(key)!,
    }));
    result[dateKey] = { dots };
  }
  return result;
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd mobile && npx jest src/shared/utils/__tests__/calendarMarkers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add mobile/src/shared/utils/dateRange.ts mobile/src/shared/utils/calendarMarkers.ts mobile/src/shared/utils/__tests__/dateRange.test.ts mobile/src/shared/utils/__tests__/calendarMarkers.test.ts
git commit -m "feat(mobile): 캘린더 날짜별 마커 계산 순수 함수 추가"
```

---

### Task 3: `useCalendarTodos` 훅

**Files:**
- Create: `mobile/src/hooks/useCalendarTodos.ts`
- Test: `mobile/src/hooks/__tests__/useCalendarTodos.test.tsx`

**Interfaces:**
- Consumes: `useTodos()`(`mobile/src/hooks/useTodos.ts`, 기존), `useUpdateTodo()`(`mobile/src/hooks/useUpdateTodo.ts`, 기존), `buildCalendarMarkedDates`/`CalendarMarkedDates`(Task 2), `isDateInTodoRange`(`dateRange.ts`, 기존)
- Produces: `UseCalendarTodosResult { markedDates: CalendarMarkedDates; isLoading: boolean; isError: boolean; getTodosForDate: (dateKey: string) => Todo[]; toggleDone: (todo: Todo) => void }` — Task 5(`CalendarScreen`)가 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/hooks/__tests__/useCalendarTodos.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";

const mockUseTodos = jest.fn();
jest.mock("../useTodos", () => ({ useTodos: () => mockUseTodos() }));

const mockUpdateMutate = jest.fn();
jest.mock("../useUpdateTodo", () => ({ useUpdateTodo: () => ({ mutate: mockUpdateMutate }) }));

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: "id",
  userId: "u1",
  title: "title",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("useCalendarTodos", () => {
  it("markedDates를 buildCalendarMarkedDates로 계산해 반환한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [makeTodo({ id: "a", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "doing" })],
      isLoading: false,
      isError: false,
    });

    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    expect(Object.keys(result.current.markedDates)).toEqual(["2026-06-20"]);
  });

  it("getTodosForDate는 isDateInTodoRange로 그 날짜의 항목만 반환한다(완료 포함)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "a", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "b", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "done" }),
        makeTodo({ id: "c", dueAt: new Date(2026, 5, 21, 9).toISOString(), status: "todo" }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    expect(result.current.getTodosForDate("2026-06-20").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("toggleDone은 완료↔미완료 상태와 doneAt을 함께 갱신하도록 mutate를 호출한다", async () => {
    mockUseTodos.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    const todo = makeTodo({ id: "a", status: "todo", title: "제목" });
    result.current.toggleDone(todo);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: "a",
      fields: { status: "done", doneAt: expect.any(String) },
      title: "제목",
    });
  });

  it("isLoading/isError를 useTodos()에서 그대로 전달한다", async () => {
    mockUseTodos.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.getTodosForDate("2026-06-20")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useCalendarTodos.test.tsx`
Expected: FAIL — `Cannot find module '../useCalendarTodos'`.

- [ ] **Step 3: 구현**

`mobile/src/hooks/useCalendarTodos.ts`:

```ts
import { useCallback, useMemo } from "react";
import type { Todo } from "@tododo/core";
import { useTodos } from "./useTodos";
import { useUpdateTodo } from "./useUpdateTodo";
import { isDateInTodoRange } from "../shared/utils/dateRange";
import { buildCalendarMarkedDates, type CalendarMarkedDates } from "../shared/utils/calendarMarkers";

export interface UseCalendarTodosResult {
  markedDates: CalendarMarkedDates;
  isLoading: boolean;
  isError: boolean;
  getTodosForDate: (dateKey: string) => Todo[];
  toggleDone: (todo: Todo) => void;
}

/**
 * 캘린더 화면의 데이터 소스. 신규 쿼리 훅 없이 기존 useTodos()(TanStack Query,
 * 폴링) 결과를 그대로 마커/날짜별 목록으로 가공한다(스펙 5절 "Firestore 실시간
 * 리스너 도입 안 함"과 동일 정책).
 */
export const useCalendarTodos = (): UseCalendarTodosResult => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutate: updateTodo } = useUpdateTodo();

  const markedDates = useMemo(() => buildCalendarMarkedDates(todos ?? []), [todos]);

  const getTodosForDate = useCallback(
    (dateKey: string) => (todos ?? []).filter((todo) => isDateInTodoRange(dateKey, todo)),
    [todos],
  );

  // useTodayTodos.ts의 toggleDone과 동일 로직(웹 toggleDone과 동일 정책) — 화면마다
  // 독립된 훅에 두는 기존 컨벤션(client/CLAUDE.md "커스텀 훅")을 따라 그대로 반복한다.
  const toggleDone = useCallback(
    (todo: Todo) => {
      const isDone = todo.status === "done";
      updateTodo({
        id: todo.id,
        fields: { status: isDone ? "todo" : "done", doneAt: isDone ? null : new Date().toISOString() },
        title: todo.title,
      });
    },
    [updateTodo],
  );

  return { markedDates, isLoading, isError, getTodosForDate, toggleDone };
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useCalendarTodos.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/hooks/useCalendarTodos.ts mobile/src/hooks/__tests__/useCalendarTodos.test.tsx
git commit -m "feat(mobile): useCalendarTodos 훅 추가"
```

---

### Task 4: `DateTodosSheet` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/dateTodosSheet/DateTodosSheet.tsx`
- Test: `mobile/src/shared/ui/dateTodosSheet/__tests__/DateTodosSheet.test.tsx`

**Interfaces:**
- Consumes: `TodayTodoItem`(`mobile/src/shared/ui/todayTodoItem/TodayTodoItem.tsx`, 기존 — props `{todo, selectedDate, onToggleDone, onPress}`), `EmptyState`(기존), `Button`(기존, `variant="primary"`)
- Produces: `DateTodosSheetProps { isOpen: boolean; onClose: () => void; dateLabel: string; selectedDate: string; todos: Todo[]; onToggleDone: (todo: Todo) => void; onPressTodo: (todo: Todo) => void; onAddTodo: () => void }` — Task 5(`CalendarScreen`)가 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/dateTodosSheet/__tests__/DateTodosSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";

const baseTodo: Todo = {
  id: "a",
  userId: "u1",
  title: "할 일 A",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("DateTodosSheet", () => {
  it("항목이 없으면 빈 상태와 할 일 추가 버튼을 보여준다", async () => {
    const onAddTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[]}
        onToggleDone={jest.fn()}
        onPressTodo={jest.fn()}
        onAddTodo={onAddTodo}
      />,
    );

    // RN Modal jest mock 특성상 visible=true 초기 렌더도 한 틱 뒤에 반영된다.
    await waitFor(() => {
      expect(screen.getByText("6월 20일, 토요일")).toBeTruthy();
    });
    expect(screen.getByText("이 날짜엔 할 일이 없어요")).toBeTruthy();

    fireEvent.press(screen.getByText("할 일 추가"));
    expect(onAddTodo).toHaveBeenCalled();
  });

  it("항목이 있으면 목록을 보여주고, 항목을 누르면 onPressTodo를 호출한다", async () => {
    const onPressTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={jest.fn()}
        onPressTodo={onPressTodo}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 A")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("할 일 A"));
    expect(onPressTodo).toHaveBeenCalledWith(baseTodo);
  });

  it("체크박스를 누르면 onToggleDone을 호출한다", async () => {
    const onToggleDone = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={onToggleDone}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("할 일 A 완료 처리")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("할 일 A 완료 처리"));
    expect(onToggleDone).toHaveBeenCalledWith(baseTodo);
  });

  it("항목이 있어도 하단 '할 일 추가' 버튼을 보여준다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={jest.fn()}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 추가")).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest src/shared/ui/dateTodosSheet`
Expected: FAIL — `Cannot find module '../DateTodosSheet'`.

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/dateTodosSheet/DateTodosSheet.tsx`:

```tsx
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import { TodayTodoItem } from "../todayTodoItem/TodayTodoItem";
import { EmptyState } from "../emptyState/EmptyState";
import { Button } from "../button/Button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface DateTodosSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** formatTodayLabel(selectedDate) 결과, 예: "6월 20일, 토요일". */
  dateLabel: string;
  /** 로컬 "yyyy-MM-dd". TodayTodoItem의 진행 일차 배지 계산 기준으로 그대로 전달한다. */
  selectedDate: string;
  todos: Todo[];
  onToggleDone: (todo: Todo) => void;
  onPressTodo: (todo: Todo) => void;
  onAddTodo: () => void;
}

/**
 * 캘린더에서 날짜를 탭했을 때 여는 시트. 기존 shared/ui/bottomSheet/BottomSheet는
 * 옵션 단일 선택 전용(상태 변경 시트)이라 할 일 목록+추가 버튼을 담을 수 없어,
 * 같은 Modal+slide+overlay+handle 시각 언어로 새로 만든다(계획 문서 1절 참고).
 * 항목 유무와 무관하게 항상 열리고(스펙 8절 결정 1), 빈 상태에도 추가 버튼을 둔다.
 */
export const DateTodosSheet = ({
  isOpen,
  onClose,
  dateLabel,
  selectedDate,
  todos,
  onToggleDone,
  onPressTodo,
  onAddTodo,
}: DateTodosSheetProps) => {
  const hasTodos = todos.length > 0;

  return (
    <Modal transparent animationType="slide" visible={isOpen} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="닫기">
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{dateLabel}</Text>
          </View>

          {hasTodos ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {todos.map((todo) => (
                <TodayTodoItem
                  key={todo.id}
                  todo={todo}
                  selectedDate={selectedDate}
                  onToggleDone={onToggleDone}
                  onPress={onPressTodo}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <EmptyState
                icon={CalendarDays}
                title="이 날짜엔 할 일이 없어요"
                description="새로운 할 일을 추가해보세요"
              />
            </View>
          )}

          <View style={styles.footer}>
            <Button title="할 일 추가" onPress={onAddTodo} variant="primary" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.tertiary,
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  empty: {
    minHeight: 240,
  },
  footer: {
    padding: spacing.lg,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/shared/ui/dateTodosSheet`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/shared/ui/dateTodosSheet
git commit -m "feat(mobile): 날짜별 할 일 시트(DateTodosSheet) 컴포넌트 추가"
```

---

### Task 5: `CalendarScreen` 조립 (마커 + 날짜 탭 + 시트 + 네비게이션)

**Files:**
- Modify: `mobile/src/screens/CalendarScreen.tsx` (Task 1 스켈레톤을 확장)
- Modify: `mobile/src/screens/__tests__/CalendarScreen.test.tsx` (Task 1 스모크 테스트를 확장)

**Interfaces:**
- Consumes: `useCalendarTodos()`(Task 3), `DateTodosSheet`(Task 4), `CalendarMarkedDates`/`CalendarDot`(Task 2), `formatTodayLabel`(`mobile/src/shared/utils/formatToday.ts`, 기존), `parseLocalDateOnly`(`dateRange.ts`, 기존), `CalendarStackParamList`(`mobile/src/navigation/types.ts`, 기존)
- Produces: 완성된 `CalendarScreen` — Task 6(`RootNavigator`)이 `CalendarPlaceholderScreen` 대신 배선한다.

- [ ] **Step 1: 기존 스모크 테스트를 실패하는 통합 테스트로 확장**

`mobile/src/screens/__tests__/CalendarScreen.test.tsx`를 다음으로 **전체 교체**한다:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";

const mockUseCalendarTodos = jest.fn();
jest.mock("../../hooks/useCalendarTodos", () => ({
  useCalendarTodos: () => mockUseCalendarTodos(),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// react-native-calendars의 실제 월간 그리드 렌더링은 이 스크린의 관심사가 아니다
// (라이브러리 자체 동작은 Task 1에서 별도 검증). onDayPress 배선만 검증할 수 있도록
// 최소 스텁으로 대체한다.
jest.mock("react-native-calendars", () => {
  const { Pressable, Text } = require("react-native");
  return {
    Calendar: ({ onDayPress }: { onDayPress: (day: { dateString: string }) => void }) => (
      <Pressable testID="calendar-day-2026-06-20" onPress={() => onDayPress({ dateString: "2026-06-20" })}>
        <Text>20</Text>
      </Pressable>
    ),
  };
});

const baseTodo: Todo = {
  id: "a",
  userId: "u1",
  title: "할 일 A",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("CalendarScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("로딩 중이면 스켈레톤을 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: true,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("불러오기 실패 시 에러 상태를 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: true,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });

  it("날짜를 탭하면 시트가 열리고 그 날짜의 항목만 보여준다", async () => {
    const getTodosForDate = jest.fn((dateKey: string) => (dateKey === "2026-06-20" ? [baseTodo] : []));
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate,
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));

    await waitFor(() => {
      expect(screen.getByText("할 일 A")).toBeTruthy();
    });
    expect(getTodosForDate).toHaveBeenCalledWith("2026-06-20");
  });

  it("항목이 없는 날짜를 탭해도 시트가 열리고 빈 상태를 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));

    await waitFor(() => {
      expect(screen.getByText("이 날짜엔 할 일이 없어요")).toBeTruthy();
    });
  });

  it("시트의 '할 일 추가'를 누르면 탭한 날짜를 dueAt으로 채워 TodoForm으로 navigate한다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
    await waitFor(() => screen.getByText("할 일 추가"));
    fireEvent.press(screen.getByText("할 일 추가"));

    const expectedDueAt = new Date(2026, 5, 20).toISOString();
    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { dueAt: expectedDueAt });
  });

  it("시트의 항목을 누르면 TodoDetail로 navigate한다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [baseTodo],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
    await waitFor(() => screen.getByText("할 일 A"));
    fireEvent.press(screen.getByText("할 일 A"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest src/screens/__tests__/CalendarScreen.test.tsx`
Expected: FAIL — `mockUseCalendarTodos`가 아직 배선 안 됨(로딩 스켈레톤/에러 상태/날짜 탭 관련 텍스트를 못 찾음).

- [ ] **Step 3: `CalendarScreen.tsx` 전체 구현으로 교체**

`mobile/src/screens/CalendarScreen.tsx`:

```tsx
import { useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Calendar, type DateData } from "react-native-calendars";
import { AlertCircle } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { CalendarStackParamList } from "../navigation/types";
import { useCalendarTodos } from "../hooks/useCalendarTodos";
import { DateTodosSheet } from "../shared/ui/dateTodosSheet/DateTodosSheet";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { formatTodayLabel } from "../shared/utils/formatToday";
import { parseLocalDateOnly } from "../shared/utils/dateRange";
import type { CalendarMarkedDates } from "../shared/utils/calendarMarkers";
import { colors } from "../theme/colors";

const CALENDAR_THEME = {
  todayTextColor: colors.brand.strong,
  selectedDayBackgroundColor: colors.brand.strong,
  selectedDayTextColor: colors.background.primary,
  arrowColor: colors.brand.strong,
  monthTextColor: colors.text.primary,
  textSectionTitleColor: colors.text.secondary,
} as const;

/** selectedDate 항목에 선택 표시(selected)를 덧붙인다 — 기존 markedDates는 불변으로 둔다. */
function withSelection(markedDates: CalendarMarkedDates, selectedDate: string | null): CalendarMarkedDates {
  if (!selectedDate) return markedDates;
  const existing = markedDates[selectedDate] ?? { dots: [] };
  return { ...markedDates, [selectedDate]: { ...existing, selected: true } };
}

export const CalendarScreen = () => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { markedDates, isLoading, isError, getTodosForDate, toggleDone } = useCalendarTodos();

  const handleDayPress = (day: DateData) => {
    // day.dateString은 react-native-calendars가 이미 로컬 캘린더 날짜 기준
    // "yyyy-MM-dd"로 준다 — 우리 쪽 toDateKey/toDateKeyFromISO 변환을 다시 거치면
    // 이중 변환이 되므로 그대로 dateKey로 쓴다.
    setSelectedDate(day.dateString);
    setIsSheetOpen(true);
  };

  const handleAddTodo = () => {
    if (!selectedDate) return;
    setIsSheetOpen(false);
    navigation.navigate("TodoForm", { dueAt: parseLocalDateOnly(selectedDate).toISOString() });
  };

  const handlePressTodo = (todo: Todo) => {
    setIsSheetOpen(false);
    navigation.navigate("TodoDetail", { id: todo.id });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <Calendar
        markingType="multi-dot"
        markedDates={withSelection(markedDates, selectedDate)}
        onDayPress={handleDayPress}
        theme={CALENDAR_THEME}
      />
      <DateTodosSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        dateLabel={selectedDate ? formatTodayLabel(selectedDate) : ""}
        selectedDate={selectedDate ?? ""}
        todos={selectedDate ? getTodosForDate(selectedDate) : []}
        onToggleDone={toggleDone}
        onPressTodo={handlePressTodo}
        onAddTodo={handleAddTodo}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/screens/__tests__/CalendarScreen.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/CalendarScreen.tsx mobile/src/screens/__tests__/CalendarScreen.test.tsx
git commit -m "feat(mobile): CalendarScreen에 마커/날짜 탭/시트/네비게이션 배선"
```

---

### Task 6: `RootNavigator` 배선 교체 + 플레이스홀더 제거 + 전체 검증

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Delete: `mobile/src/screens/CalendarPlaceholderScreen.tsx`

**Interfaces:**
- Consumes: `CalendarScreen`(Task 5)

- [ ] **Step 1: `RootNavigator.tsx`에서 플레이스홀더를 `CalendarScreen`으로 교체**

`mobile/src/navigation/RootNavigator.tsx`의 import 교체:

```diff
-import { CalendarPlaceholderScreen } from "../screens/CalendarPlaceholderScreen";
+import { CalendarScreen } from "../screens/CalendarScreen";
```

`CalendarTabStack` 내부 교체:

```diff
-    <CalendarStack.Screen name="Calendar" component={CalendarPlaceholderScreen} options={{ title: "캘린더" }} />
+    <CalendarStack.Screen name="Calendar" component={CalendarScreen} options={{ title: "캘린더" }} />
```

- [ ] **Step 2: 플레이스홀더 파일 삭제**

Run: `rm mobile/src/screens/CalendarPlaceholderScreen.tsx`

(참조하는 테스트 파일 없음 — 앞서 `grep -rln "CalendarPlaceholderScreen" mobile/src`로 확인됨, `RootNavigator.tsx`와 자기 자신뿐이었다.)

- [ ] **Step 3: 타입체크**

Run: `cd mobile && npx tsc --noEmit`
Expected: 에러 없음. `react-native-calendars`의 `MarkedDates` 프롭 타입과 우리 `CalendarMarkedDates`가 구조적으로 맞지 않으면(예: `dots` 필드 옵셔널/필수 불일치) 여기서 드러난다 — 그 경우 `CalendarMarkedDates`의 `dots`를 그 타입에 맞춰 조정한다.

- [ ] **Step 4: 전체 테스트 스위트 실행**

Run: `cd mobile && npm test`
Expected: 전체 PASS(기존 테스트 회귀 없음 + 이번에 추가한 테스트 전부 포함).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/navigation/RootNavigator.tsx
git rm mobile/src/screens/CalendarPlaceholderScreen.tsx
git commit -m "feat(mobile): 캘린더 탭을 CalendarScreen으로 교체"
```

- [ ] **Step 6: 수동 시뮬레이터 확인 (자동화 불가 — 사용자 직접 확인 필요)**

자동 E2E는 스펙 7절에서 이미 범위 밖으로 결정되어 있고, 이전 세션에서 macOS 손쉬운 사용 권한 문제로 시뮬레이터 자동 클릭이 막혀 있다([[mobile-app-react-native-plan]] 메모 참고 — 재발 시 이 제약을 먼저 확인). 아래는 구현자가 사용자에게 요청해야 하는 수동 확인 목록이다(자동화하지 말 것):

1. 캘린더 탭 진입 시 월간 뷰가 정상 렌더링되는지(react-native-calendars 실제 렌더 — Task 5까지는 테스트에서 모킹했으므로 여기서 처음 실물 확인).
2. 마감이 지난 항목이 있는 날짜에 빨간 점이, 진행중 항목만 있는 날짜에 상태색 점이 뜨는지.
3. 빈 날짜/항목 있는 날짜 모두 탭 시 시트가 열리는지, "할 일 추가"가 그 날짜를 프리필해 폼으로 이동하는지.
4. 시트의 항목을 탭하면 상세 화면으로 이동하는지, 체크박스를 탭하면 즉시 반영되는지.


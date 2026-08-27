# 모바일 오늘 페이지 + 내비게이션 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 앱에 하단 탭 내비게이션(오늘/목록/캘린더)을 도입하고, 웹과 동일한 기능의 "오늘" 페이지(주간 스트립+진행률+진행중/완료 목록)를 추가한다.

**Architecture:** 기존 단일 Stack(`RootNavigator`)을 `인증 분기 Stack → BottomTab(오늘/목록/캘린더) → 탭별 내부 Stack`으로 재구성한다. 오늘 페이지는 웹의 `useTodayTodos`/`weekStrip`/`dailyProgress`/`todayTodoItem` 로직을 RN으로 포팅하고, 날짜 range 판정(`isDateInTodoRange` 등)은 `mobile/src/shared/utils/dateRange.ts`에 새 순수 함수로 둔다(캘린더 페이지 계획에서도 재사용 예정). 캘린더 탭은 이 계획에서는 플레이스홀더만 두고, 실제 구현은 별도 계획(`react-native-calendars` 도입)에서 다룬다 — 두 화면 다 다루기엔 스코프가 너무 커서 계획 단계에서 분리했다(스펙은 하나, 계획은 둘).

**Tech Stack:** React Native(Expo), React Navigation(`@react-navigation/native`, `native-stack`, 이번에 `bottom-tabs` 신규 추가), TanStack Query, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-27-mobile-today-calendar-design.md` (섹션 2 내비게이션, 3 날짜 유틸, 4 오늘 페이지, 6 로딩/에러/빈 상태 — 캘린더 관련 섹션 5는 후속 계획에서 다룸)

## Global Constraints

- `dueAt`/`startAt`은 항상 UTC `Z` ISO 문자열로 저장된다. 날짜만 뽑을 때 `split("T")[0]`을 쓰면 안 되고, 반드시 `new Date(iso)`로 파싱한 뒤 로컬 게터(`getFullYear`/`getMonth`/`getDate`)로 뽑는다 (스펙 3절).
- 날짜 유틸/테스트는 `client/src/shared/utils/dateRange.ts`·`date.ts`·`due.ts`·`formatToday.ts`의 로직을 1:1로 포팅한다 — 새로운 판정 규칙을 발명하지 않는다.
- 반복(recurrence) 항목 전용 표시는 이번 계획에서 다루지 않는다(스펙 5절 결정, Today 화면에도 동일 적용).
- 모든 신규 Pressable의 최소 터치 타겟은 44px (`MIN_TOUCH_TARGET`, `mobile/src/theme/spacing.ts`).
- 테스트에서 "오늘"에 의존하는 로직은 `jest.useFakeTimers()` + `jest.setSystemTime(...)`으로 시스템 시간을 고정한다. 절대 날짜를 하드코딩한 채 mock 없이 통과시키지 않는다.

---

### Task 1: `getUrgency` 추가 (due.ts)

**Files:**
- Modify: `mobile/src/shared/utils/due.ts`
- Test: `mobile/src/shared/utils/__tests__/due.test.ts`

**Interfaces:**
- Produces: `export type Urgency = "normal" | "soon" | "danger"`, `export function getUrgency(daysLeft: number): Urgency`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/utils/__tests__/due.test.ts`에 아래 케이스를 기존 `describe` 블록들 뒤에 추가한다(파일이 이미 존재하며 `getDaysLeft`/`getDueBadgeLabel`/`isTodoOverdue` 테스트를 갖고 있다 — import 라인에 `getUrgency`만 추가):

```ts
import { getDaysLeft, getDueBadgeLabel, isTodoOverdue, getUrgency } from "../due";

// ...기존 describe 블록들 아래에 추가

describe("getUrgency", () => {
  it("daysLeft가 0 이하이면 danger를 반환한다", () => {
    expect(getUrgency(0)).toBe("danger");
    expect(getUrgency(-1)).toBe("danger");
  });

  it("daysLeft가 1~3이면 soon을 반환한다", () => {
    expect(getUrgency(1)).toBe("soon");
    expect(getUrgency(3)).toBe("soon");
  });

  it("daysLeft가 4 이상이면 normal을 반환한다", () => {
    expect(getUrgency(4)).toBe("normal");
    expect(getUrgency(10)).toBe("normal");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest due.test.ts`
Expected: FAIL — `getUrgency is not a function` (또는 undefined export)

- [ ] **Step 3: 최소 구현 추가**

`mobile/src/shared/utils/due.ts` 맨 아래에 추가:

```ts
export type Urgency = "normal" | "soon" | "danger";

/**
 * daysLeft(getDaysLeft 결과)를 3단계 긴급도로 분류한다. D-day(0)는 지난 것과
 * 동일하게 "danger"로 묶는다(client/src/shared/utils/due.ts와 동일 정책).
 */
export function getUrgency(daysLeft: number): Urgency {
  if (daysLeft <= 0) return "danger";
  if (daysLeft <= DUE_SOON_DAYS) return "soon";
  return "normal";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest due.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/utils/due.ts mobile/src/shared/utils/__tests__/due.test.ts
git commit -m "feat: mobile due.ts에 getUrgency 추가"
```

---

### Task 2: 날짜 range 유틸 (`dateRange.ts`)

**Files:**
- Create: `mobile/src/shared/utils/dateRange.ts`
- Test: `mobile/src/shared/utils/__tests__/dateRange.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, Todo 타입에 의존하지 않고 최소 shape만 요구)
- Produces:
  - `export type DayMarker = "none" | "normal" | "danger"`
  - `export interface TodoRangeLike { startAt: string | null; dueAt: string | null }`
  - `export const toDateKey = (date: Date): string`
  - `export const parseLocalDateOnly = (dateKey: string): Date`
  - `export const toDateKeyFromISO = (iso: string): string`
  - `export const isSameLocalDay = (a: Date, b: Date): boolean`
  - `export const STRIP_WINDOW_DAYS = 7`
  - `export const getStripDates = (startDateKey: string, count?: number): Date[]`
  - `export function isDateInTodoRange(dateKey: string, todo: TodoRangeLike): boolean`
  - `export interface PeriodProgress { dayIndex: number; totalDays: number }`
  - `export function getPeriodProgress(dateKey: string, todo: TodoRangeLike): PeriodProgress | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/utils/__tests__/dateRange.test.ts` 새로 생성:

```ts
import { describe, it, expect } from "@jest/globals";
import {
  toDateKey,
  parseLocalDateOnly,
  toDateKeyFromISO,
  isSameLocalDay,
  getStripDates,
  isDateInTodoRange,
  getPeriodProgress,
} from "../dateRange";

// 로컬 타임존 기준 특정 시각의 UTC ISO 문자열을 만든다. dueAt/startAt은 UTC Z
// 문자열로 저장되므로(toISOString), "yyyy-MM-ddT..Z"를 직접 하드코딩하면 실행
// 머신의 로컬 타임존에 따라 로컬 날짜가 하루 밀려 보일 수 있다.
const localISO = (y: number, m: number, d: number, h = 9): string =>
  new Date(y, m - 1, d, h).toISOString();

describe("toDateKey / parseLocalDateOnly 왕복", () => {
  it("Date와 yyyy-MM-dd 문자열이 서로 왕복 변환된다", () => {
    const key = "2026-06-15";
    expect(toDateKey(parseLocalDateOnly(key))).toBe(key);
  });
});

describe("toDateKeyFromISO", () => {
  it("UTC ISO 문자열을 로컬 날짜 키로 변환한다", () => {
    expect(toDateKeyFromISO(localISO(2026, 6, 15))).toBe("2026-06-15");
  });

  it("date-only(T 없음) 문자열은 그대로 반환한다", () => {
    expect(toDateKeyFromISO("2026-06-15")).toBe("2026-06-15");
  });
});

describe("isSameLocalDay", () => {
  it("같은 로컬 날짜면 true를 반환한다", () => {
    expect(isSameLocalDay(new Date(2026, 5, 15, 1), new Date(2026, 5, 15, 23))).toBe(true);
  });

  it("다른 날짜면 false를 반환한다", () => {
    expect(isSameLocalDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false);
  });
});

describe("getStripDates", () => {
  it("시작일부터 기본 7일의 연속 Date 배열을 반환한다", () => {
    const dates = getStripDates("2026-06-15");
    expect(dates).toHaveLength(7);
    expect(toDateKey(dates[0])).toBe("2026-06-15");
    expect(toDateKey(dates[6])).toBe("2026-06-21");
  });

  it("count를 넘기면 그 일수만큼 반환한다", () => {
    expect(getStripDates("2026-06-15", 3)).toHaveLength(3);
  });
});

describe("isDateInTodoRange", () => {
  it("startAt/dueAt이 모두 없으면 false를 반환한다", () => {
    expect(isDateInTodoRange("2026-06-15", { startAt: null, dueAt: null })).toBe(false);
  });

  it("startAt만 있으면 startAt 날짜와 정확히 일치할 때만 true", () => {
    const todo = { startAt: localISO(2026, 6, 15), dueAt: null };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-16", todo)).toBe(false);
  });

  it("dueAt만 있으면 dueAt 날짜와 정확히 일치할 때만 true", () => {
    const todo = { startAt: null, dueAt: localISO(2026, 6, 15) };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-14", todo)).toBe(false);
  });

  it("startAt/dueAt이 모두 있으면 그 구간(양 끝 포함)에서 true", () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) };
    expect(isDateInTodoRange("2026-06-14", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-16", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-13", todo)).toBe(false);
    expect(isDateInTodoRange("2026-06-17", todo)).toBe(false);
  });

  it("date-only(T 없음) 문자열도 그대로 비교할 수 있다", () => {
    const todo = { startAt: "2026-06-14", dueAt: "2026-06-16" };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
  });
});

describe("getPeriodProgress", () => {
  it("startAt이 없으면 null을 반환한다", () => {
    expect(getPeriodProgress("2026-06-15", { startAt: null, dueAt: localISO(2026, 6, 16) })).toBeNull();
  });

  it("dueAt이 없으면 null을 반환한다", () => {
    expect(getPeriodProgress("2026-06-15", { startAt: localISO(2026, 6, 14), dueAt: null })).toBeNull();
  });

  it("startAt/dueAt의 로컬 날짜가 같으면(단일 마감일 항목) null을 반환한다", () => {
    const todo = { startAt: localISO(2026, 6, 15, 9), dueAt: localISO(2026, 6, 15, 18) };
    expect(getPeriodProgress("2026-06-15", todo)).toBeNull();
  });

  it("기간 항목의 dayIndex/totalDays를 1부터 계산한다", () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) };
    expect(getPeriodProgress("2026-06-14", todo)).toEqual({ dayIndex: 1, totalDays: 3 });
    expect(getPeriodProgress("2026-06-15", todo)).toEqual({ dayIndex: 2, totalDays: 3 });
    expect(getPeriodProgress("2026-06-16", todo)).toEqual({ dayIndex: 3, totalDays: 3 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest dateRange.test.ts`
Expected: FAIL — `Cannot find module '../dateRange'`

- [ ] **Step 3: 구현**

`mobile/src/shared/utils/dateRange.ts` 새로 생성 (client의 `date.ts`+`dateRange.ts`를 병합 포팅):

```ts
// client/src/shared/utils/date.ts + dateRange.ts의 로직을 그대로 포팅한다.
// dueAt/startAt은 UTC Z ISO 문자열로 저장되므로, 날짜만 뽑을 때 split("T")[0]을
// 쓰면 KST 등에서 하루 밀린다 — 반드시 new Date(iso)로 파싱 후 로컬 게터를 쓴다.

export type DayMarker = "none" | "normal" | "danger";

export interface TodoRangeLike {
  startAt: string | null;
  dueAt: string | null;
}

/** "yyyy-MM-dd" 문자열을 로컬 타임존 기준 Date로 변환한다. */
export const parseLocalDateOnly = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

/** Date를 로컬 타임존 기준 "yyyy-MM-dd" 문자열로 변환한다. */
export const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * ISO(또는 date-only) 문자열을 로컬 타임존 기준 "yyyy-MM-dd" 키로 변환한다.
 * "T"가 없는 순수 date-only 문자열은 이미 로컬 달력 날짜이므로 그대로 반환한다.
 */
export const toDateKeyFromISO = (iso: string): string =>
  iso.includes("T") ? toDateKey(new Date(iso)) : iso;

export const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const STRIP_WINDOW_DAYS = 7;

/** startDateKey부터 count일 연속 Date를 반환한다. */
export const getStripDates = (startDateKey: string, count: number = STRIP_WINDOW_DAYS): Date[] => {
  const start = parseLocalDateOnly(startDateKey);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

/**
 * dateKey(로컬 "yyyy-MM-dd")가 todo의 [startAt, dueAt] 구간에 포함되는지 판정한다.
 * - 시작일/마감일 모두 없으면 false
 * - 시작일만 있으면 시작일과 정확히 일치할 때만 true
 * - 마감일만 있으면 마감일과 정확히 일치할 때만 true
 * - 둘 다 있으면 시작일 <= dateKey <= 마감일
 */
export function isDateInTodoRange(dateKey: string, todo: TodoRangeLike): boolean {
  const start = todo.startAt ? toDateKeyFromISO(todo.startAt) : null;
  const end = todo.dueAt ? toDateKeyFromISO(todo.dueAt) : null;

  if (start && !end) return start === dateKey;
  if (!start && end) return end === dateKey;
  if (start && end) return dateKey >= start && dateKey <= end;

  return false;
}

export interface PeriodProgress {
  /** 1부터 시작하는 진행 일차 */
  dayIndex: number;
  /** startAt~dueAt 총 일수(양 끝 포함) */
  totalDays: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** fromKey부터 toKey까지 며칠째인지(양 끝 포함, fromKey === toKey면 1) 계산한다. */
function diffDaysInclusive(fromKey: string, toKey: string): number {
  const from = parseLocalDateOnly(fromKey);
  const to = parseLocalDateOnly(toKey);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

/**
 * dateKey 시점에 todo가 startAt~dueAt 기간 중 몇 일차/총 며칠인지 계산한다.
 * startAt이 없거나 startAt·dueAt의 로컬 날짜가 같으면(단일 마감일 항목) null.
 */
export function getPeriodProgress(dateKey: string, todo: TodoRangeLike): PeriodProgress | null {
  if (!todo.startAt || !todo.dueAt) return null;

  const startKey = toDateKeyFromISO(todo.startAt);
  const endKey = toDateKeyFromISO(todo.dueAt);
  if (startKey === endKey) return null;

  return {
    dayIndex: diffDaysInclusive(startKey, dateKey),
    totalDays: diffDaysInclusive(startKey, endKey),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest dateRange.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/utils/dateRange.ts mobile/src/shared/utils/__tests__/dateRange.test.ts
git commit -m "feat: mobile 날짜 range 유틸(dateRange.ts) 추가"
```

---

### Task 3: 오늘 라벨 포맷 유틸 (`formatToday.ts`)

**Files:**
- Create: `mobile/src/shared/utils/formatToday.ts`
- Test: `mobile/src/shared/utils/__tests__/formatToday.test.ts`

**Interfaces:**
- Consumes: `parseLocalDateOnly`, `isSameLocalDay` (Task 2)
- Produces: `export function formatTodayLabel(date: string): string`, `export function formatDueTime(dueAt: string): string | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/utils/__tests__/formatToday.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { formatTodayLabel, formatDueTime } from "../formatToday";

describe("formatTodayLabel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("오늘 날짜면 '오늘'을 붙인다", () => {
    expect(formatTodayLabel("2026-06-15")).toBe("6월 15일, 오늘");
  });

  it("오늘이 아니면 요일명을 붙인다", () => {
    expect(formatTodayLabel("2026-06-16")).toBe("6월 16일, 화요일");
  });
});

describe("formatDueTime", () => {
  it("시각 정보가 자정(00:00)이면 null을 반환한다", () => {
    const midnightLocalIso = new Date(2026, 5, 15, 0, 0).toISOString();
    expect(formatDueTime(midnightLocalIso)).toBeNull();
  });

  it("오전 시각을 '오전 N시'로 포맷한다", () => {
    const iso = new Date(2026, 5, 15, 9, 0).toISOString();
    expect(formatDueTime(iso)).toBe("오전 9시");
  });

  it("오후 시각을 '오후 N시'로 포맷한다", () => {
    const iso = new Date(2026, 5, 15, 14, 0).toISOString();
    expect(formatDueTime(iso)).toBe("오후 2시");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest formatToday.test.ts`
Expected: FAIL — `Cannot find module '../formatToday'`

- [ ] **Step 3: 구현**

`mobile/src/shared/utils/formatToday.ts`:

```ts
import { parseLocalDateOnly, isSameLocalDay } from "./dateRange";

const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/**
 * 날짜 타이틀 포맷. 오늘이면 "6월 15일, 오늘", 아니면 "6월 16일, 화요일".
 */
export function formatTodayLabel(date: string): string {
  const target = parseLocalDateOnly(date);
  const today = new Date();

  const month = target.getMonth() + 1;
  const day = target.getDate();
  const datePart = `${month}월 ${day}일`;

  if (isSameLocalDay(target, today)) {
    return `${datePart}, 오늘`;
  }

  const weekday = WEEKDAY_LABELS[target.getDay()];
  return `${datePart}, ${weekday}`;
}

/**
 * 마감 시각 포맷 "오후 2시". dueAt이 자정(00:00, 시간 정보 없음으로 간주)이면 null.
 */
export function formatDueTime(dueAt: string): string | null {
  const due = new Date(dueAt);
  const hours = due.getHours();
  const minutes = due.getMinutes();

  if (hours === 0 && minutes === 0) {
    return null;
  }

  const period = hours < 12 ? "오전" : "오후";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${period} ${hour12}시`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest formatToday.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/utils/formatToday.ts mobile/src/shared/utils/__tests__/formatToday.test.ts
git commit -m "feat: mobile 오늘 라벨/마감시각 포맷 유틸 추가"
```

---

### Task 4: 내비게이션 타입 정의 (`navigation/types.ts`)

새 타입 파일만 추가한다 — 아직 `RootNavigator.tsx`는 건드리지 않는다(Task 11에서 실제로 교체).

**Files:**
- Create: `mobile/src/navigation/types.ts`

**Interfaces:**
- Produces:
  - `export type TodoDetailParams = { id: string }`
  - `export type TodoFormParams = { parentId?: string; dueAt?: string } | undefined`
  - `export type TodayStackParamList = { Today: undefined; TodoDetail: TodoDetailParams; TodoForm: TodoFormParams }`
  - `export type TodoListStackParamList = { TodoList: undefined; TodoForm: TodoFormParams; TodoDetail: TodoDetailParams }`
  - `export type CalendarStackParamList = { Calendar: undefined; TodoDetail: TodoDetailParams; TodoForm: TodoFormParams }`

이 파일은 순수 타입 정의라 런타임 테스트가 없다. 대신 타입 체크로 검증한다.

- [ ] **Step 1: 파일 생성**

`mobile/src/navigation/types.ts`:

```ts
export type TodoDetailParams = { id: string };

/** dueAt: 캘린더/오늘 화면에서 특정 날짜를 선택한 채로 추가할 때 그 날짜를 프리필한다. */
export type TodoFormParams = { parentId?: string; dueAt?: string } | undefined;

export type TodayStackParamList = {
  Today: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

export type TodoListStackParamList = {
  TodoList: undefined;
  TodoForm: TodoFormParams;
  TodoDetail: TodoDetailParams;
};

export type CalendarStackParamList = {
  Calendar: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};
```

- [ ] **Step 2: 타입 체크로 검증**

Run: `cd mobile && npx tsc --noEmit`
Expected: 기존 에러 없이 통과 (새 파일은 아직 아무 곳에서도 import되지 않으므로 기존 빌드에 영향 없음)

- [ ] **Step 3: 커밋**

```bash
git add mobile/src/navigation/types.ts
git commit -m "feat: mobile 탭별 내비게이션 파라미터 타입 추가"
```

---

### Task 5: `Checkbox` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/checkbox/Checkbox.tsx`
- Test: `mobile/src/shared/ui/checkbox/__tests__/Checkbox.test.tsx`

기존 `ColorDot`(상태 3단 순환용)과 달리, 오늘 화면은 완료/미완료 이진 토글이 필요하다 (스펙 4절 "체크박스 탭 → status/doneAt 토글").

**Interfaces:**
- Produces: `interface CheckboxProps { checked: boolean; onPress: () => void; accessibilityLabel: string; testID?: string }`, `export const Checkbox: (props: CheckboxProps) => JSX.Element`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/checkbox/__tests__/Checkbox.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  // lucide-react-native 아이콘은 RN testID가 아니라 웹 관례인 data-testid만
  // SVG에 설정한다(node_modules/lucide-react-native/dist/cjs/Icon.js 확인됨) —
  // @testing-library/react-native의 getByTestId로 못 찾는다. accessibilityState로
  // 검증한다.
  it("checked=false면 접근성 상태가 checked:false다", () => {
    render(<Checkbox checked={false} onPress={jest.fn()} accessibilityLabel="완료 처리" />);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(false);
  });

  it("checked=true면 접근성 상태가 checked:true다", () => {
    render(<Checkbox checked={true} onPress={jest.fn()} accessibilityLabel="완료 처리" />);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
  });

  it("탭하면 onPress가 호출된다", () => {
    const onPress = jest.fn();
    render(<Checkbox checked={false} onPress={onPress} accessibilityLabel="완료 처리" />);
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest shared/ui/checkbox`
Expected: FAIL — `Cannot find module '../Checkbox'`

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/checkbox/Checkbox.tsx`:

```tsx
import { Pressable, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius } from "../../../theme/spacing";

interface CheckboxProps {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/** 완료/미완료 이진 토글. 상태 3단 순환용 ColorDot과는 별개 컴포넌트다. */
export const Checkbox = ({ checked, onPress, accessibilityLabel, testID }: CheckboxProps) => {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.base, checked && styles.checked]}
    >
      {checked && <Check size={14} color={colors.background.primary} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: 22,
    height: 22,
    minWidth: MIN_TOUCH_TARGET / 2,
    minHeight: MIN_TOUCH_TARGET / 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: {
    backgroundColor: colors.brand.strong,
    borderColor: colors.brand.strong,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest shared/ui/checkbox`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/ui/checkbox
git commit -m "feat: mobile Checkbox 컴포넌트 추가"
```

---

### Task 6: `PeriodBadge` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/periodBadge/PeriodBadge.tsx`
- Test: `mobile/src/shared/ui/periodBadge/__tests__/PeriodBadge.test.tsx`

**Interfaces:**
- Produces: `interface PeriodBadgeProps { dayIndex: number; totalDays: number }`, `export const PeriodBadge: (props: PeriodBadgeProps) => JSX.Element`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/periodBadge/__tests__/PeriodBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";
import { PeriodBadge } from "../PeriodBadge";

describe("PeriodBadge", () => {
  it("dayIndex/totalDays를 'n/총일차' 형태로 렌더링한다", () => {
    render(<PeriodBadge dayIndex={2} totalDays={3} />);
    expect(screen.getByText("2/3일차")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest shared/ui/periodBadge`
Expected: FAIL — `Cannot find module '../PeriodBadge'`

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/periodBadge/PeriodBadge.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radius, spacing } from "../../../theme/spacing";

interface PeriodBadgeProps {
  /** 1부터 시작하는 진행 일차 */
  dayIndex: number;
  /** startAt~dueAt 총 일수(양 끝 포함) */
  totalDays: number;
}

/**
 * 기간(startAt~dueAt) 항목이 매일 노출될 때 "오늘이 며칠째인지" 보여주는 칩.
 * 브랜드 그린(RecurrenceBadge)과 겹치지 않도록 중립 회색을 쓴다.
 */
export const PeriodBadge = ({ dayIndex, totalDays }: PeriodBadgeProps) => (
  <View style={styles.badge}>
    <Text style={styles.text}>{`${dayIndex}/${totalDays}일차`}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.background.secondary,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.secondary,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest shared/ui/periodBadge`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/ui/periodBadge
git commit -m "feat: mobile PeriodBadge 컴포넌트 추가"
```

---

### Task 7: `TodayTodoItem` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/todayTodoItem/TodayTodoItem.tsx`
- Test: `mobile/src/shared/ui/todayTodoItem/__tests__/TodayTodoItem.test.tsx`

**Interfaces:**
- Consumes: `Checkbox`(Task 5), `PeriodBadge`(Task 6), `Card`(기존 `shared/ui/card`), `DueBadge`(기존 `shared/ui/dueBadge`), `getDaysLeft`/`getDueBadgeLabel`/`getUrgency`(Task 1, `due.ts`), `getPeriodProgress`(Task 2), `formatDueTime`(Task 3), `Todo` 타입(`@tododo/core`)
- Produces:
  ```ts
  interface TodayTodoItemProps {
    todo: Todo;
    selectedDate: string;
    onToggleDone: (todo: Todo) => void;
    onPress: (todo: Todo) => void;
  }
  export const TodayTodoItem: (props: TodayTodoItemProps) => JSX.Element
  ```

**동작 (스펙 4절 + 웹 `todayTodoItem.tsx` 대응, 반복/링크/삭제 아이콘은 이번 스코프 제외):**
- `isDone = todo.status === "done"`
- `daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null`, `urgency = daysLeft !== null ? getUrgency(daysLeft) : "normal"`
- `periodProgress = !isDone ? getPeriodProgress(selectedDate, todo) : null`, 있으면 제목 앞에 `PeriodBadge` 표시
- 우측 배지: `!isDone && urgency !== "normal"`이면 `DueBadge daysLeft={daysLeft}` 표시. `urgency === "normal"`이면 마지막 날(`periodProgress` 없거나 `dayIndex === totalDays`)엔 `formatDueTime(todo.dueAt)` 있을 때만 텍스트로, 그 외엔 `D-n` 텍스트로 표시.
- 카드 좌측 보더 색은 `statusColors[todo.status].border` (기존 `ChildTodoCard` 패턴과 동일)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/todayTodoItem/__tests__/TodayTodoItem.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { TodayTodoItem } from "../TodayTodoItem";

const baseTodo: Todo = {
  id: "t1",
  userId: "u1",
  title: "테스트 할 일",
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

describe("TodayTodoItem", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("제목을 렌더링한다", () => {
    render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("테스트 할 일")).toBeTruthy();
  });

  it("체크박스를 누르면 onToggleDone이 호출된다", () => {
    const onToggleDone = jest.fn();
    render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={onToggleDone} onPress={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onToggleDone).toHaveBeenCalledWith(baseTodo);
  });

  it("본문(제목 영역)을 누르면 onPress가 호출된다", () => {
    const onPress = jest.fn();
    render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={onPress} />,
    );
    fireEvent.press(screen.getByText("테스트 할 일"));
    expect(onPress).toHaveBeenCalledWith(baseTodo);
  });

  it("마감이 지났으면(danger) 초과 배지를 보여준다", () => {
    const overdue = { ...baseTodo, dueAt: new Date(2026, 5, 10, 9).toISOString() };
    render(
      <TodayTodoItem todo={overdue} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("5일 초과")).toBeTruthy();
  });

  it("기간(startAt~dueAt) 항목이면 진행 일차 배지를 보여준다", () => {
    const periodTodo = {
      ...baseTodo,
      startAt: new Date(2026, 5, 14, 9).toISOString(),
      dueAt: new Date(2026, 5, 16, 9).toISOString(),
    };
    render(
      <TodayTodoItem todo={periodTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("2/3일차")).toBeTruthy();
  });

  it("완료된 항목은 체크박스가 checked 상태다", () => {
    const done = { ...baseTodo, status: "done" as const, doneAt: "2026-06-15T00:00:00.000Z" };
    render(
      <TodayTodoItem todo={done} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest shared/ui/todayTodoItem`
Expected: FAIL — `Cannot find module '../TodayTodoItem'`

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/todayTodoItem/TodayTodoItem.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { Checkbox } from "../checkbox/Checkbox";
import { PeriodBadge } from "../periodBadge/PeriodBadge";
import { Card } from "../card/Card";
import { DueBadge } from "../dueBadge/DueBadge";
import { getDaysLeft, getDueBadgeLabel, getUrgency } from "../../utils/due";
import { getPeriodProgress } from "../../utils/dateRange";
import { formatDueTime } from "../../utils/formatToday";
import { statusColors } from "../../../theme/statusColors";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface TodayTodoItemProps {
  todo: Todo;
  /** 진행 일차 배지 계산 기준 날짜(로컬 yyyy-MM-dd). */
  selectedDate: string;
  onToggleDone: (todo: Todo) => void;
  onPress: (todo: Todo) => void;
}

/**
 * 웹 todayTodoItem.tsx 대응. 반복 배지·링크 표시·삭제 버튼은 이번 스코프에서
 * 제외한다(2026-08-27 스펙 결정).
 */
export const TodayTodoItem = ({ todo, selectedDate, onToggleDone, onPress }: TodayTodoItemProps) => {
  const isDone = todo.status === "done";
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const urgency = daysLeft !== null ? getUrgency(daysLeft) : "normal";
  const periodProgress = !isDone ? getPeriodProgress(selectedDate, todo) : null;
  const isLastDayOfPeriod = periodProgress ? periodProgress.dayIndex === periodProgress.totalDays : true;
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;

  return (
    <Card borderColor={statusColors[todo.status].border} testID={`today-item-${todo.id}`}>
      <View style={styles.row}>
        <Checkbox
          checked={isDone}
          onPress={() => onToggleDone(todo)}
          accessibilityLabel={`${todo.title} 완료 처리`}
        />
        <Pressable style={styles.content} onPress={() => onPress(todo)}>
          <View style={styles.titleRow}>
            {periodProgress && (
              <PeriodBadge dayIndex={periodProgress.dayIndex} totalDays={periodProgress.totalDays} />
            )}
            <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
              {todo.title}
            </Text>
          </View>
        </Pressable>
        {!isDone && daysLeft !== null && urgency !== "normal" && <DueBadge daysLeft={daysLeft} />}
        {!isDone && urgency === "normal" && (
          <>
            {isLastDayOfPeriod
              ? dueTime && <Text style={styles.timeLabel}>{dueTime}</Text>
              : daysLeft !== null && <Text style={styles.timeLabel}>{getDueBadgeLabel(daysLeft)}</Text>}
          </>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  titleDone: {
    color: colors.text.tertiary,
    textDecorationLine: "line-through",
  },
  timeLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest shared/ui/todayTodoItem`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/ui/todayTodoItem
git commit -m "feat: mobile TodayTodoItem 컴포넌트 추가"
```

---

### Task 8: `WeekStrip` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/weekStrip/WeekStrip.tsx`
- Test: `mobile/src/shared/ui/weekStrip/__tests__/WeekStrip.test.tsx`

**Interfaces:**
- Consumes: `getStripDates`, `isSameLocalDay`, `toDateKey`, `DayMarker`(Task 2)
- Produces:
  ```ts
  interface WeekStripProps {
    selectedDate: string;
    windowStart: string;
    markers: Record<string, DayMarker>;
    onSelectDate: (date: string) => void;
    onShiftLeft: () => void;
    onShiftRight: () => void;
    onGoToToday: () => void;
  }
  export const WeekStrip: (props: WeekStripProps) => JSX.Element
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/weekStrip/__tests__/WeekStrip.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { WeekStrip } from "../WeekStrip";

describe("WeekStrip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const defaultProps = {
    selectedDate: "2026-06-15",
    windowStart: "2026-06-15",
    markers: {},
    onSelectDate: jest.fn(),
    onShiftLeft: jest.fn(),
    onShiftRight: jest.fn(),
    onGoToToday: jest.fn(),
  };

  it("windowStart부터 7일의 날짜를 렌더링한다", () => {
    render(<WeekStrip {...defaultProps} />);
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
  });

  it("날짜를 누르면 onSelectDate가 호출된다", () => {
    const onSelectDate = jest.fn();
    render(<WeekStrip {...defaultProps} onSelectDate={onSelectDate} />);
    fireEvent.press(screen.getByText("16"));
    expect(onSelectDate).toHaveBeenCalledWith("2026-06-16");
  });

  it("왼쪽/오른쪽 화살표를 누르면 각각의 콜백이 호출된다", () => {
    const onShiftLeft = jest.fn();
    const onShiftRight = jest.fn();
    render(<WeekStrip {...defaultProps} onShiftLeft={onShiftLeft} onShiftRight={onShiftRight} />);
    fireEvent.press(screen.getByLabelText("이전 날짜"));
    fireEvent.press(screen.getByLabelText("다음 날짜"));
    expect(onShiftLeft).toHaveBeenCalledTimes(1);
    expect(onShiftRight).toHaveBeenCalledTimes(1);
  });

  it("오늘이 스트립 안에 있으면 '오늘' 칩을 보여주지 않는다", () => {
    render(<WeekStrip {...defaultProps} />);
    expect(screen.queryByLabelText("오늘로 이동")).toBeNull();
  });

  it("오늘이 스트립 밖이면 '오늘' 칩을 보여주고 누르면 onGoToToday가 호출된다", () => {
    const onGoToToday = jest.fn();
    render(
      <WeekStrip {...defaultProps} windowStart="2026-07-01" selectedDate="2026-07-01" onGoToToday={onGoToToday} />,
    );
    fireEvent.press(screen.getByLabelText("오늘로 이동"));
    expect(onGoToToday).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest shared/ui/weekStrip`
Expected: FAIL — `Cannot find module '../WeekStrip'`

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/weekStrip/WeekStrip.tsx`:

```tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { getStripDates, isSameLocalDay, toDateKey, type DayMarker } from "../../utils/dateRange";
import { colors } from "../../../theme/colors";
import { spacing, radius, MIN_TOUCH_TARGET } from "../../../theme/spacing";

const WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const MARKER_COLOR: Record<DayMarker, string | null> = {
  none: null,
  normal: colors.brand.fill,
  danger: colors.danger.main,
};

interface WeekStripProps {
  selectedDate: string;
  windowStart: string;
  markers: Record<string, DayMarker>;
  onSelectDate: (date: string) => void;
  onShiftLeft: () => void;
  onShiftRight: () => void;
  onGoToToday: () => void;
}

export const WeekStrip = ({
  selectedDate,
  windowStart,
  markers,
  onSelectDate,
  onShiftLeft,
  onShiftRight,
  onGoToToday,
}: WeekStripProps) => {
  const today = new Date();
  const stripDates = getStripDates(windowStart);
  const isTodayInStrip = stripDates.some((d) => isSameLocalDay(d, today));

  return (
    <View style={styles.container}>
      <Pressable onPress={onShiftLeft} accessibilityRole="button" accessibilityLabel="이전 날짜" hitSlop={8}>
        <ChevronLeft size={18} color={colors.text.secondary} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {stripDates.map((date) => {
          const dateKey = toDateKey(date);
          const isSelected = dateKey === selectedDate;
          const isToday = isSameLocalDay(date, today);
          const marker = markers[dateKey] ?? "none";
          const weekdayShort = WEEKDAY_SHORT_LABELS[date.getDay()];
          const weekdayFull = WEEKDAY_FULL_LABELS[date.getDay()];
          const dotColor = MARKER_COLOR[marker];

          return (
            <Pressable
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayFull}`}
              style={[styles.dayCell, isSelected && styles.dayCellSelected]}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{weekdayShort}</Text>
              <Text style={[styles.dateLabel, isSelected && styles.dateLabelSelected, isToday && styles.dateLabelToday]}>
                {date.getDate()}
              </Text>
              <View style={[styles.dot, dotColor ? { backgroundColor: dotColor } : styles.dotHidden]} />
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onShiftRight} accessibilityRole="button" accessibilityLabel="다음 날짜" hitSlop={8}>
        <ChevronRight size={18} color={colors.text.secondary} />
      </Pressable>
      {!isTodayInStrip && (
        <Pressable onPress={onGoToToday} accessibilityRole="button" accessibilityLabel="오늘로 이동" style={styles.todayChip}>
          <Text style={styles.todayChipText}>오늘</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  scroll: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  dayCell: {
    width: 40,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: 2,
  },
  dayCellSelected: {
    backgroundColor: colors.brand.strong,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  dayLabelSelected: {
    color: colors.background.primary,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  dateLabelToday: {
    color: colors.brand.strong,
  },
  dateLabelSelected: {
    color: colors.background.primary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotHidden: {
    backgroundColor: "transparent",
  },
  todayChip: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand.strong,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest shared/ui/weekStrip`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/ui/weekStrip
git commit -m "feat: mobile WeekStrip 컴포넌트 추가"
```

---

### Task 9: `DailyProgress` 컴포넌트

**Files:**
- Create: `mobile/src/shared/ui/dailyProgress/DailyProgress.tsx`
- Test: `mobile/src/shared/ui/dailyProgress/__tests__/DailyProgress.test.tsx`

**Interfaces:**
- Consumes: 기존 `shared/ui/progressBar/ProgressBar` — `interface ProgressBarProps { progress: number /* 0~100 */; isOverdue?: boolean }` (확인됨, `mobile/src/shared/ui/progressBar/ProgressBar.tsx`)
- Produces:
  ```ts
  interface DailyProgressProps { dateLabel: string; doneCount: number; totalCount: number }
  export const DailyProgress: (props: DailyProgressProps) => JSX.Element
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/shared/ui/dailyProgress/__tests__/DailyProgress.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";
import { DailyProgress } from "../DailyProgress";

describe("DailyProgress", () => {
  it("날짜 라벨과 완료/전체 카운트를 렌더링한다", () => {
    render(<DailyProgress dateLabel="6월 15일, 오늘" doneCount={2} totalCount={5} />);
    expect(screen.getByText("6월 15일, 오늘")).toBeTruthy();
    expect(screen.getByText("2 / 5 완료")).toBeTruthy();
  });

  it("totalCount가 0이어도 에러 없이 렌더링한다", () => {
    render(<DailyProgress dateLabel="6월 15일, 오늘" doneCount={0} totalCount={0} />);
    expect(screen.getByText("0 / 0 완료")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest shared/ui/dailyProgress`
Expected: FAIL — `Cannot find module '../DailyProgress'`

- [ ] **Step 3: 구현**

`mobile/src/shared/ui/dailyProgress/DailyProgress.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { ProgressBar } from "../progressBar/ProgressBar";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface DailyProgressProps {
  dateLabel: string;
  doneCount: number;
  totalCount: number;
}

export const DailyProgress = ({ dateLabel, doneCount, totalCount }: DailyProgressProps) => {
  const progress = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <Text style={styles.completionLabel}>{`${doneCount} / ${totalCount} 완료`}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  completionLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest shared/ui/dailyProgress`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/shared/ui/dailyProgress
git commit -m "feat: mobile DailyProgress 컴포넌트 추가"
```

---

### Task 10: `useTodayTodos` 훅

**Files:**
- Create: `mobile/src/hooks/useTodayTodos.ts`
- Test: `mobile/src/hooks/__tests__/useTodayTodos.test.tsx`

**Interfaces:**
- Consumes: `useTodos()`(기존), `useUpdateTodo()`(기존), `isDateInTodoRange`/`getStripDates`/`toDateKey`(Task 2), `getDaysLeft`(Task 1)
- Produces:
  ```ts
  export type DayMarker = "none" | "normal" | "danger"; // dateRange.ts에서 재수출
  export interface UseTodayTodosResult {
    inProgressTodos: Todo[];
    doneTodos: Todo[];
    doneCount: number;
    totalCount: number;
    markers: Record<string, DayMarker>;
    isLoading: boolean;
    isError: boolean;
    toggleDone: (todo: Todo) => void;
  }
  export const useTodayTodos = (selectedDate: string, windowStart: string): UseTodayTodosResult
  ```

**동작 (웹 `useTodayTodos.ts`와 동일 정책):** `isDateInTodoRange`로 선택 날짜의 todo를 걸러 진행중/완료로 나누고, 완료는 `doneAt` 내림차순 정렬. 주간 스트립 마커는 **dueAt 단독 기준**(range 확장 안 함, 스펙 명시 정책) — 그 날짜가 dueAt인 미완료 항목 중 `getDaysLeft <= 0`이면 `danger`, 있으면 `normal`, 없으면 `none`.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/hooks/__tests__/useTodayTodos.test.tsx`:

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

describe("useTodayTodos", () => {
  it("선택 날짜에 해당하는 항목만 진행중/완료로 분리한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "a", dueAt: new Date(2026, 5, 15, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "b", dueAt: new Date(2026, 5, 15, 9).toISOString(), status: "done", doneAt: "2026-06-15T01:00:00.000Z" }),
        makeTodo({ id: "c", dueAt: new Date(2026, 5, 16, 9).toISOString() }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useTodayTodos } = await import("../useTodayTodos");
    const { result } = renderHook(() => useTodayTodos("2026-06-15", "2026-06-15"));

    expect(result.current.inProgressTodos.map((t) => t.id)).toEqual(["a"]);
    expect(result.current.doneTodos.map((t) => t.id)).toEqual(["b"]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.doneCount).toBe(1);
  });

  it("dueAt 기준 마커를 계산한다(range 확장 안 함)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "danger", dueAt: new Date(2026, 5, 10, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "normal", dueAt: new Date(2026, 5, 16, 9).toISOString(), status: "todo" }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useTodayTodos } = await import("../useTodayTodos");
    const { result } = renderHook(() => useTodayTodos("2026-06-15", "2026-06-15"));

    expect(result.current.markers["2026-06-10"]).toBe("danger");
    expect(result.current.markers["2026-06-16"]).toBe("normal");
    expect(result.current.markers["2026-06-12"]).toBe("none");
  });

  it("toggleDone은 완료↔미완료 상태와 doneAt을 함께 갱신하도록 mutate를 호출한다", async () => {
    mockUseTodos.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { useTodayTodos } = await import("../useTodayTodos");
    const { result } = renderHook(() => useTodayTodos("2026-06-15", "2026-06-15"));

    const todo = makeTodo({ id: "a", status: "todo", title: "제목" });
    result.current.toggleDone(todo);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: "a",
      fields: { status: "done", doneAt: expect.any(String) },
      title: "제목",
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest useTodayTodos`
Expected: FAIL — `Cannot find module '../useTodayTodos'`

- [ ] **Step 3: 구현**

`mobile/src/hooks/useTodayTodos.ts`:

```ts
import { useCallback, useMemo } from "react";
import type { Todo } from "@tododo/core";
import { useTodos } from "./useTodos";
import { useUpdateTodo } from "./useUpdateTodo";
import { getDaysLeft } from "../shared/utils/due";
import { getStripDates, isDateInTodoRange, toDateKey, toDateKeyFromISO, type DayMarker } from "../shared/utils/dateRange";

export type { DayMarker };

export interface UseTodayTodosResult {
  inProgressTodos: Todo[];
  doneTodos: Todo[];
  doneCount: number;
  totalCount: number;
  markers: Record<string, DayMarker>;
  isLoading: boolean;
  isError: boolean;
  toggleDone: (todo: Todo) => void;
}

/**
 * 선택된 날짜가 startAt~dueAt 구간에 포함되는 todo(isDateInTodoRange)를
 * 진행중/완료로 분리하고, 주간 스트립용 마커와 완료율을 계산한다.
 * 웹 client/src/features/today/hooks/useTodayTodos.ts와 동일 정책.
 */
export const useTodayTodos = (selectedDate: string, windowStart: string): UseTodayTodosResult => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutate: updateTodo } = useUpdateTodo();

  const todosForSelectedDate = useMemo(() => {
    if (!todos) return [];
    return todos.filter((todo) => isDateInTodoRange(selectedDate, todo));
  }, [todos, selectedDate]);

  const inProgressTodos = useMemo(
    () => todosForSelectedDate.filter((todo) => todo.status !== "done"),
    [todosForSelectedDate],
  );

  const doneTodos = useMemo(
    () =>
      todosForSelectedDate
        .filter((todo) => todo.status === "done")
        .sort((a, b) => {
          const aTime = a.doneAt ? new Date(a.doneAt).getTime() : 0;
          const bTime = b.doneAt ? new Date(b.doneAt).getTime() : 0;
          return bTime - aTime;
        }),
    [todosForSelectedDate],
  );

  // 마커는 의도적으로 dueAt 단독 기준을 유지한다(range 포함으로 확장 안 함) —
  // "마감 임박(빨간 점)"은 여전히 dueAt 기준 위험도 신호다(스펙 결정 사항).
  const markers = useMemo(() => {
    const stripDateKeys = getStripDates(windowStart).map(toDateKey);
    const result: Record<string, DayMarker> = {};

    for (const dateKey of stripDateKeys) {
      const todosOnDate = (todos ?? []).filter((todo) => {
        if (!todo.dueAt) return false;
        return toDateKeyFromISO(todo.dueAt) === dateKey;
      });

      if (todosOnDate.length === 0) {
        result[dateKey] = "none";
        continue;
      }

      const hasDanger = todosOnDate.some(
        (todo) => todo.status !== "done" && getDaysLeft(todo.dueAt as string) <= 0,
      );
      result[dateKey] = hasDanger ? "danger" : "normal";
    }

    return result;
  }, [todos, windowStart]);

  // useUpdateTodo의 mutate 시그니처는 { id, fields, title } 형태다(웹의 "Todo 전체를
  // 넘기는" 시그니처와 다르다 — mobile/src/hooks/useUpdateTodo.ts 확인됨).
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

  return {
    inProgressTodos,
    doneTodos,
    doneCount: doneTodos.length,
    totalCount: todosForSelectedDate.length,
    markers,
    isLoading,
    isError,
    toggleDone,
  };
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest useTodayTodos`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/hooks/useTodayTodos.ts mobile/src/hooks/__tests__/useTodayTodos.test.tsx
git commit -m "feat: mobile useTodayTodos 훅 추가"
```

---

### Task 11: `TodayScreen` 조립

**Files:**
- Create: `mobile/src/screens/TodayScreen.tsx`
- Test: `mobile/src/screens/__tests__/TodayScreen.test.tsx`

**Interfaces:**
- Consumes: `useTodayTodos`(Task 10), `WeekStrip`(Task 8), `DailyProgress`(Task 9), `TodayTodoItem`(Task 7), 기존 `EmptyState`/`ListSkeleton`, `TodayStackParamList`(Task 4), `formatTodayLabel`(Task 3)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/screens/__tests__/TodayScreen.test.tsx` (기존 `TodoListScreen.test.tsx`의 mock 패턴을 그대로 따른다):

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockUseTodayTodos = jest.fn();
jest.mock("../../hooks/useTodayTodos", () => ({
  useTodayTodos: (...args: unknown[]) => mockUseTodayTodos(...args),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const baseTodo = {
  id: "a",
  userId: "u1",
  title: "오늘 할 일",
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

describe("TodayScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("로딩 중이면 스켈레톤을 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: true, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("항목이 없으면 빈 상태를 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    expect(screen.getByText("오늘 할 일이 없습니다")).toBeTruthy();
  });

  it("진행중 항목을 '진행 중' 섹션에 렌더링한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [baseTodo], doneTodos: [], doneCount: 0, totalCount: 1,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("오늘 할 일")).toBeTruthy();
  });

  it("항목을 누르면 TodoDetail로 navigate한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [baseTodo], doneTodos: [], doneCount: 0, totalCount: 1,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    fireEvent.press(screen.getByText("오늘 할 일"));
    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
  });

  it("'할 일 추가' 버튼을 누르면 선택 날짜를 dueAt으로 채워 TodoForm으로 navigate한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    fireEvent.press(screen.getByText("할 일 추가"));
    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { dueAt: expect.any(String) });
  });

  it("불러오기 실패 시 에러 상태를 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: true, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    render(<TodayScreen />);
    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npx jest screens/__tests__/TodayScreen`
Expected: FAIL — `Cannot find module '../TodayScreen'`

- [ ] **Step 3: 구현**

`mobile/src/screens/TodayScreen.tsx`:

```tsx
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Sun, Plus, AlertCircle } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { TodayStackParamList } from "../navigation/types";
import { useTodayTodos } from "../hooks/useTodayTodos";
import { WeekStrip } from "../shared/ui/weekStrip/WeekStrip";
import { DailyProgress } from "../shared/ui/dailyProgress/DailyProgress";
import { TodayTodoItem } from "../shared/ui/todayTodoItem/TodayTodoItem";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { formatTodayLabel } from "../shared/utils/formatToday";
import { toDateKey, parseLocalDateOnly } from "../shared/utils/dateRange";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const TodayScreen = () => {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [windowStart, setWindowStart] = useState(() => toDateKey(new Date()));
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const shiftWindow = (days: number) => {
    setWindowStart((prev) => {
      const d = parseLocalDateOnly(prev);
      d.setDate(d.getDate() + days);
      return toDateKey(d);
    });
  };

  const handleGoToToday = () => {
    const today = toDateKey(new Date());
    setWindowStart(today);
    setSelectedDate(today);
  };

  const { inProgressTodos, doneTodos, doneCount, totalCount, markers, isLoading, isError, toggleDone } =
    useTodayTodos(selectedDate, windowStart);

  const handleOpenDetail = (todo: Todo) => navigation.navigate("TodoDetail", { id: todo.id });
  const handleAdd = () => {
    // parseLocalDateOnly는 이미 로컬 자정(00:00:00) Date를 반환하므로 그대로 UTC ISO로 변환한다.
    navigation.navigate("TodoForm", { dueAt: parseLocalDateOnly(selectedDate).toISOString() });
  };

  const hasTodos = inProgressTodos.length > 0 || doneTodos.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <WeekStrip
        selectedDate={selectedDate}
        windowStart={windowStart}
        markers={markers}
        onSelectDate={setSelectedDate}
        onShiftLeft={() => shiftWindow(-7)}
        onShiftRight={() => shiftWindow(7)}
        onGoToToday={handleGoToToday}
      />
      <DailyProgress dateLabel={formatTodayLabel(selectedDate)} doneCount={doneCount} totalCount={totalCount} />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      ) : !hasTodos ? (
        <EmptyState
          icon={Sun}
          title="오늘 할 일이 없습니다"
          description="여유로운 하루네요. 새로운 할 일을 추가해보세요"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {inProgressTodos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>진행 중</Text>
              <View style={styles.list}>
                {inProgressTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    selectedDate={selectedDate}
                    onToggleDone={toggleDone}
                    onPress={handleOpenDetail}
                  />
                ))}
              </View>
            </View>
          )}
          {doneTodos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>완료</Text>
              <View style={styles.list}>
                {doneTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    selectedDate={selectedDate}
                    onToggleDone={toggleDone}
                    onPress={handleOpenDetail}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <Pressable
        onPress={handleAdd}
        accessibilityRole="button"
        accessibilityLabel="할 일 추가"
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Plus size={16} color={colors.background.primary} />
        <Text style={styles.addButtonText}>할 일 추가</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  list: {
    gap: spacing.sm,
  },
  addButton: {
    minHeight: 48,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand.strong,
    borderRadius: 10,
  },
  addButtonPressed: {
    backgroundColor: colors.brand.strongHover,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.background.primary,
  },
});
```

(`ListSkeleton`은 자체적으로 `testID="list-skeleton"`을 갖고 있어(`mobile/src/shared/ui/skeleton/ListSkeleton.tsx` 확인됨) 별도 prop 전달이 필요 없다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest screens/__tests__/TodayScreen`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/screens/TodayScreen.tsx mobile/src/screens/__tests__/TodayScreen.test.tsx
git commit -m "feat: mobile TodayScreen 조립"
```

---

### Task 12: 내비게이션 재구성 (BottomTab + 탭별 Stack)

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/src/screens/TodoListScreen.tsx` (import만 변경)
- Modify: `mobile/src/screens/TodoFormScreen.tsx` (import 변경 + `dueAt` 프리필)
- Modify: `mobile/src/screens/TodoDetailScreen.tsx` (import만 변경)
- Create: `mobile/src/screens/CalendarPlaceholderScreen.tsx` (후속 계획에서 실제 캘린더로 교체)
- Modify: `mobile/package.json` (의존성 추가)

**Interfaces:**
- Consumes: `TodayScreen`(Task 11), `TodayStackParamList`/`TodoListStackParamList`/`CalendarStackParamList`/`TodoFormParams`(Task 4)

- [ ] **Step 1: 의존성 추가**

Run: `cd mobile && npm install @react-navigation/bottom-tabs@^7`

- [ ] **Step 2: `CalendarPlaceholderScreen` 생성**

`mobile/src/screens/CalendarPlaceholderScreen.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

/** 캘린더 탭 자리표시자. 실제 구현은 후속 계획(react-native-calendars 도입)에서 교체한다. */
export const CalendarPlaceholderScreen = () => (
  <SafeAreaView style={styles.screen}>
    <View style={styles.center}>
      <Text style={styles.text}>캘린더는 준비 중입니다</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.secondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 14, color: colors.text.secondary },
});
```

- [ ] **Step 3: `TodoFormScreen.tsx`에 `dueAt` 프리필 추가**

`mobile/src/screens/TodoFormScreen.tsx`에서 아래 두 곳을 수정:

```ts
// 변경 전
import type { RootStackParamList } from "../navigation/RootNavigator";
// 변경 후
import type { TodoListStackParamList } from "../navigation/types";
```

```ts
// 변경 전
const [dueAt, setDueAt] = useState<string | null>(null);
// ...
const route = useRoute<RouteProp<RootStackParamList, "TodoForm">>();
const parentId = route.params?.parentId ?? null;

// 변경 후
const route = useRoute<RouteProp<TodoListStackParamList, "TodoForm">>();
const parentId = route.params?.parentId ?? null;
const [dueAt, setDueAt] = useState<string | null>(route.params?.dueAt ?? null);
```

(`useState` 선언은 `route` 선언보다 아래로 옮겨야 초기값 계산 시 `route.params`를 참조할 수 있다.)

나머지 두 스크린은 순수 타입 교체만 한다:

`mobile/src/screens/TodoListScreen.tsx`:
```ts
// 변경 전
import type { RootStackParamList } from "../navigation/RootNavigator";
// 변경 후
import type { TodoListStackParamList } from "../navigation/types";
```
그리고 `useNavigation<NativeStackNavigationProp<RootStackParamList>>()` → `useNavigation<NativeStackNavigationProp<TodoListStackParamList>>()`.

`mobile/src/screens/TodoDetailScreen.tsx`:
```ts
// 변경 전
import type { RootStackParamList } from "../navigation/RootNavigator";
// 변경 후
import type { TodoListStackParamList } from "../navigation/types";
```
(`TodoDetail`은 세 탭에서 공통으로 쓰이지만, `TodoDetailScreen.tsx` 자체는 어느 스택에 꽂히든 `id`/`parentId` 파라미터 shape이 동일하므로 `TodoListStackParamList` 하나만 참조해도 타입상 안전하다 — 세 탭의 `TodoDetail`/`TodoForm` entry가 전부 동일한 `TodoDetailParams`/`TodoFormParams`이기 때문이다.) 이어서 `RouteProp<RootStackParamList, "TodoDetail">` → `RouteProp<TodoListStackParamList, "TodoDetail">`, `NativeStackNavigationProp<RootStackParamList>` → `NativeStackNavigationProp<TodoListStackParamList>`으로 교체.

- [ ] **Step 4: `RootNavigator.tsx` 재구성**

`mobile/src/navigation/RootNavigator.tsx` 전체를 아래로 교체:

```tsx
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { Sun, ListTodo, CalendarDays } from "lucide-react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { TodoListScreen } from "../screens/TodoListScreen";
import { TodoFormScreen } from "../screens/TodoFormScreen";
import { TodoDetailScreen } from "../screens/TodoDetailScreen";
import { CalendarPlaceholderScreen } from "../screens/CalendarPlaceholderScreen";
import type { TodayStackParamList, TodoListStackParamList, CalendarStackParamList } from "./types";
import { colors } from "../theme/colors";

const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const TodoListStack = createNativeStackNavigator<TodoListStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const Tab = createBottomTabNavigator();

const TodayTabStack = () => (
  <TodayStack.Navigator>
    <TodayStack.Screen name="Today" component={TodayScreen} options={{ title: "오늘" }} />
    <TodayStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodayStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
  </TodayStack.Navigator>
);

const TodoListTabStack = () => (
  <TodoListStack.Navigator>
    <TodoListStack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
    <TodoListStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodoListStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
  </TodoListStack.Navigator>
);

const CalendarTabStack = () => (
  <CalendarStack.Navigator>
    <CalendarStack.Screen name="Calendar" component={CalendarPlaceholderScreen} options={{ title: "캘린더" }} />
    <CalendarStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <CalendarStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
  </CalendarStack.Navigator>
);

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brand.strong,
      tabBarInactiveTintColor: colors.text.tertiary,
    }}
  >
    <Tab.Screen
      name="오늘"
      component={TodayTabStack}
      options={{ tabBarIcon: ({ color, size }) => <Sun color={color} size={size} /> }}
    />
    <Tab.Screen
      name="목록"
      component={TodoListTabStack}
      options={{ tabBarIcon: ({ color, size }) => <ListTodo color={color} size={size} /> }}
    />
    <Tab.Screen
      name="캘린더"
      component={CalendarTabStack}
      options={{ tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }}
    />
  </Tab.Navigator>
);

export const RootNavigator = () => {
  const { user, loading } = useAuthState();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <NavigationContainer>{user ? <MainTabs /> : <LoginScreen />}</NavigationContainer>;
};
```

(`RootStackParamList`는 이 파일에서 완전히 제거된다 — Step 3에서 모든 소비처를 `navigation/types.ts`로 옮겼기 때문에 안전하다.)

- [ ] **Step 5: 전체 테스트 + 타입 체크**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: 타입 에러 없음, 기존 스크린 테스트(`TodoListScreen`/`TodoFormScreen`/`TodoDetailScreen`) 포함 전체 PASS

이 단계에서 실패가 나면 원인은 대개 둘 중 하나다:
- 세 스크린 중 하나가 여전히 `RootStackParamList`를 import하고 있음 → Step 3 재확인
- `TodoFormScreen.tsx`의 `dueAt` useState 초기화 순서 문제(route보다 먼저 선언됨) → Step 3 재확인

- [ ] **Step 6: 커밋**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/navigation mobile/src/screens
git commit -m "feat: mobile 하단 탭 내비게이션(오늘/목록/캘린더) 도입 + TodoForm dueAt 프리필"
```

---

## 마무리 (수동 확인)

이 계획은 여기서 끝나지만, 자동 테스트로 검증할 수 없는 부분이 남아있다:

- **탭 전환 후 뒤로가기 스택 확인**: 오늘 탭에서 할 일 상세로 들어갔다가 목록 탭으로 전환 후 다시 오늘 탭으로 돌아오면, 오늘 탭은 상세 화면에 머물러 있어야 한다(React Navigation의 탭별 독립 스택 기본 동작) — 시뮬레이터에서 직접 확인 필요.
- **macOS 손쉬운 사용 권한 제약**: 이전 세션에서 Accessibility 권한이 막혀 `osascript` 기반 시뮬레이터 자동 클릭이 안 되는 상태로 기록되어 있다([[mobile-app-react-native-plan]] 메모리 참고). 이번 계획의 실기기/시뮬레이터 확인은 사용자가 직접 탭해서 검증해야 한다.
- 캘린더 탭은 플레이스홀더 상태로 남는다 — 다음 계획에서 `react-native-calendars` 기반 실제 화면으로 교체한다.

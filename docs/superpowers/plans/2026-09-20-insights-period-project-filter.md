# 완료 통계 확장(기간 프리셋 × 프로젝트 필터 + SVG 차트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/insights` 화면에 기간 프리셋(이번 주/이번 달/최근 90일/전체) × 프로젝트(루트 할 일) 필터를 추가하고, CSS div 막대를 core 기하 계산 + 얇은 SVG 렌더러로 교체한다.

**Architecture:** 필터·지표·차트 기하 계산은 전부 `packages/core/src/insights/`의 순수 함수(클라이언트/모바일 공유). 웹은 `useProductivityMetrics(filter)`가 `useMemo`로 그 함수들을 호출하고, `<svg>` 렌더러 3종(세로 막대/가로 막대/누적 막대)이 숫자를 그대로 그린다. Firestore 쿼리(`useTodosForStats`)와 프리미엄 게이트는 건드리지 않는다.

**Tech Stack:** TypeScript, React 19, styled-components, TanStack Query(기존), Vitest + Testing Library. 새 런타임 의존성 **없음**.

**Spec:** `docs/superpowers/specs/2026-09-20-insights-period-project-filter-design.md`

## Global Constraints

- 새 npm 런타임 의존성 추가 금지(차트 라이브러리 X). `client/bundle-budget.json` 예산이 CI에서 강제된다.
- 날짜 경계는 전부 **로컬 날짜 키(`yyyy-MM-dd`) 문자열 비교**로 판단한다. `iso.split("T")[0]` 금지, ms 뺄셈으로 "며칠 차이" 계산 금지(DST/타임존 경계에서 하루 어긋남).
- 주 시작은 **일요일**(`Date#getDay() === 0`).
- 색은 기존 토큰만 사용: `colors.brand.strong`(막대), `colors.border.tertiary`(눈금선), `colors.text.secondary`/`tertiary`(라벨), `colors.background.secondary`(가로 막대 트랙), `statusColors.{todo,doing,done}.main`(상태 막대). 새 hex 값 추가 금지.
- `packages/core`는 `client/`를 import할 수 없다(`@/...` 별칭 없음). 필요한 날짜 헬퍼는 core 안에 둔다.
- `packages/core/dist`는 **git에 커밋되어 있고** client가 `dist/index.js`/`dist/index.d.ts`를 참조한다. core 소스를 바꾼 태스크는 반드시 `cd packages/core && npm run build`를 실행하고 `dist/`를 함께 커밋한다. 이걸 빼먹으면 client 타입체크가 "export 없음"으로 실패한다.
- 테스트에서 시간에 의존하는 함수는 `now`를 인자로 명시해 넘긴다(고정값). `new Date()`에 기대는 테스트 금지.
- 커밋 시 husky pre-commit이 client lint-staged/tsc/vitest + server jest를 돌린다. **`--no-verify` 등 훅 우회 금지.** 훅이 실패하면 원인을 고친다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 한 줄을 붙인다.
- 작업 디렉터리: `/Users/river/tododo/.claude/worktrees/insights-period-project-filter` (브랜치 `worktree-insights-period-project-filter`). 원본 `/Users/river/tododo`로 `cd`하지 말 것.

---

## 파일 구조

**`packages/core/src/insights/`** (신규 디렉터리, 전부 순수 함수)
- `date.ts` — 로컬 날짜 키 헬퍼(`toDateKey`, `toDateKeyFromISO`, `parseDateKey`, `addDaysToKey`, `toMonthKey`, `addMonthsToMonthKey`, `diffDaysBetweenKeys`)
- `filter.ts` — `PeriodPreset`/`InsightsFilter`/`PeriodRange` 타입, `resolvePeriodRange`, `isKeyInRange`, `scopeTodosByProject`, `scopeTodosByRange`, `DEFAULT_INSIGHTS_FILTER`
- `metrics.ts` — 완료율/스트릭/우선순위 분포/반복 비율/기한 준수율(client에서 이동) + `computeStatusBreakdown`, `listProjectOptions`
- `trend.ts` — `resolveTrendGranularity`, `bucketCompletions`
- `labels.ts` — `PERIOD_PRESETS`, `PERIOD_TAB_LABELS`, `PERIOD_TITLE_LABELS`
- `chart/layoutBarChart.ts`, `chart/layoutHorizontalBars.ts`, `chart/layoutStackedBar.ts`
- `index.ts` — 위 전부 re-export. `packages/core/src/index.ts`가 `export * from "./insights"`.
- `__tests__/*.test.ts`

**`client/src/shared/hooks/useElementWidth.ts`** — `ResizeObserver`로 컨테이너 너비 측정.

**`client/src/features/insights/`**
- `components/charts/barChart.tsx`, `horizontalBars.tsx`, `stackedBar.tsx` — SVG 렌더러(너비를 props로 받음, 데이터 무관)
- `components/insightsFilterBar.tsx` + `.styles.tsx` — 기간 탭 + 프로젝트 select
- `components/statusBreakdownCard.tsx` + `.styles.tsx` — 누적 막대 + 범례
- `components/completionTrend.tsx`, `priorityDistribution.tsx` — SVG 버전으로 교체
- `components/insightsSummaryCards.tsx`, `streakCard.tsx` — props/캡션 수정
- `hooks/useProductivityMetrics.ts` — `(filter)` 시그니처
- `pages/insightsPage.tsx` — 필터 상태 + 배선
- `utils/` — **삭제**(core로 이동)

---

### Task 1: core 날짜 헬퍼 + 기간/프로젝트 필터

**Files:**
- Create: `packages/core/src/insights/date.ts`
- Create: `packages/core/src/insights/filter.ts`
- Create: `packages/core/src/insights/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/insights/__tests__/date.test.ts`
- Test: `packages/core/src/insights/__tests__/filter.test.ts`

**Interfaces:**
- Consumes: `Todo` from `packages/core/src/types/todo.ts` (`parentId: string | null`, `dueAt/doneAt: string | null`)
- Produces:
  - `toDateKey(date: Date): string`, `toDateKeyFromISO(iso: string): string`, `parseDateKey(key: string): Date`, `addDaysToKey(key: string, days: number): string`, `toMonthKey(dateKey: string): string`, `addMonthsToMonthKey(monthKey: string, months: number): string`, `diffDaysBetweenKeys(fromKey: string, toKey: string): number`
  - `type PeriodPreset = "thisWeek" | "thisMonth" | "last90Days" | "all"`
  - `interface InsightsFilter { period: PeriodPreset; projectId: string | null }`
  - `type PeriodRange = { startKey: string; endKey: string } | null`
  - `DEFAULT_INSIGHTS_FILTER: InsightsFilter`
  - `resolvePeriodRange(period: PeriodPreset, now?: Date): PeriodRange`
  - `isKeyInRange(key: string, range: PeriodRange): boolean`
  - `scopeTodosByProject(todos: Todo[], projectId: string | null): Todo[]`
  - `scopeTodosByRange(todos: Todo[], range: PeriodRange): Todo[]`

- [ ] **Step 1: 날짜 헬퍼 실패 테스트 작성**

`packages/core/src/insights/__tests__/date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toDateKey,
  toDateKeyFromISO,
  parseDateKey,
  addDaysToKey,
  toMonthKey,
  addMonthsToMonthKey,
  diffDaysBetweenKeys,
} from "../date";

describe("insights/date", () => {
  it("toDateKey는 로컬 연/월/일을 0 패딩한 yyyy-MM-dd로 만든다", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("toDateKeyFromISO는 T가 있으면 로컬 날짜로 변환하고, date-only면 그대로 반환한다", () => {
    const local = new Date(2026, 8, 14, 12);
    expect(toDateKeyFromISO(local.toISOString())).toBe("2026-09-14");
    expect(toDateKeyFromISO("2026-09-14")).toBe("2026-09-14");
  });

  it("parseDateKey는 로컬 자정 Date를 만든다", () => {
    const d = parseDateKey("2026-03-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
  });

  it("addDaysToKey는 월/연 경계를 넘어 더하고 뺀다", () => {
    expect(addDaysToKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToKey("2026-09-14", -89)).toBe("2026-06-17");
  });

  it("toMonthKey는 yyyy-MM만 남긴다", () => {
    expect(toMonthKey("2026-09-14")).toBe("2026-09");
  });

  it("addMonthsToMonthKey는 연 경계를 넘어 더한다", () => {
    expect(addMonthsToMonthKey("2026-11", 1)).toBe("2026-12");
    expect(addMonthsToMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("diffDaysBetweenKeys는 달력 일수 차이를 정수로 돌려준다", () => {
    expect(diffDaysBetweenKeys("2026-09-01", "2026-09-14")).toBe(13);
    expect(diffDaysBetweenKeys("2026-09-14", "2026-09-01")).toBe(-13);
    // DST 전환이 있는 타임존에서도 23/25시간 하루를 1일로 센다
    expect(diffDaysBetweenKeys("2026-03-07", "2026-03-09")).toBe(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/date.test.ts`
Expected: FAIL — `Failed to resolve import "../date"`

- [ ] **Step 3: `date.ts` 구현**

`packages/core/src/insights/date.ts`:

```ts
/**
 * 로컬 달력 날짜 키("yyyy-MM-dd") 헬퍼. dueAt/doneAt은 UTC ISO 문자열로 저장되어
 * 있으므로 "며칠 차이"를 ms 뺄셈으로 구하면 DST/타임존 경계에서 하루가 어긋난다.
 * 여기 함수들은 항상 로컬 게터(getFullYear/getMonth/getDate)로 키를 만들고 키
 * 문자열끼리 비교/가감한다. client/src/shared/utils/date.ts의 toDateKey /
 * toDateKeyFromISO와 동일 구현 — core는 client를 import할 수 없어 복제한다.
 */

const pad2 = (n: number): string => `${n}`.padStart(2, "0");

/** Date → 로컬 "yyyy-MM-dd". */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** ISO(또는 date-only) 문자열 → 로컬 "yyyy-MM-dd". date-only는 이미 달력 날짜라 그대로. */
export const toDateKeyFromISO = (iso: string): string =>
  iso.includes("T") ? toDateKey(new Date(iso)) : iso;

/** "yyyy-MM-dd" → 로컬 자정 Date. `new Date("yyyy-MM-dd")`는 UTC 자정이라 쓰지 않는다. */
export const parseDateKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

/** 날짜 키에 일수를 더한다(음수 가능). 월/연 경계는 Date#setDate가 처리한다. */
export const addDaysToKey = (key: string, days: number): string => {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** "yyyy-MM-dd" → "yyyy-MM". */
export const toMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

/** "yyyy-MM"에 개월 수를 더한다(음수 가능). */
export const addMonthsToMonthKey = (monthKey: string, months: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1 + months, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 두 날짜 키 사이의 달력 일수(toKey - fromKey). 로컬 자정끼리의 ms 차이를 하루로
 * 나눈 뒤 반올림해서, DST로 23/25시간짜리 날이 끼어도 정수 일수가 유지된다.
 */
export const diffDaysBetweenKeys = (fromKey: string, toKey: string): number =>
  Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / MS_PER_DAY);
```

- [ ] **Step 4: 날짜 테스트 통과 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/date.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 필터 실패 테스트 작성**

`packages/core/src/insights/__tests__/filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import {
  DEFAULT_INSIGHTS_FILTER,
  resolvePeriodRange,
  isKeyInRange,
  scopeTodosByProject,
  scopeTodosByRange,
} from "../filter";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "u1",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  ...overrides,
});

describe("resolvePeriodRange", () => {
  // 2026-09-16은 수요일(getDay() === 3)
  const now = new Date(2026, 8, 16, 15);

  it("thisWeek는 이번 주 일요일부터 오늘까지다", () => {
    expect(resolvePeriodRange("thisWeek", now)).toEqual({ startKey: "2026-09-13", endKey: "2026-09-16" });
  });

  it("오늘이 일요일이면 thisWeek는 오늘 하루다", () => {
    const sunday = new Date(2026, 8, 13, 9);
    expect(resolvePeriodRange("thisWeek", sunday)).toEqual({ startKey: "2026-09-13", endKey: "2026-09-13" });
  });

  it("thisMonth는 1일부터 오늘까지다", () => {
    expect(resolvePeriodRange("thisMonth", now)).toEqual({ startKey: "2026-09-01", endKey: "2026-09-16" });
  });

  it("last90Days는 오늘 포함 90일이다", () => {
    expect(resolvePeriodRange("last90Days", now)).toEqual({ startKey: "2026-06-19", endKey: "2026-09-16" });
  });

  it("all은 null이다", () => {
    expect(resolvePeriodRange("all", now)).toBeNull();
  });
});

describe("isKeyInRange", () => {
  const range = { startKey: "2026-09-01", endKey: "2026-09-16" };

  it("양끝을 포함한다", () => {
    expect(isKeyInRange("2026-09-01", range)).toBe(true);
    expect(isKeyInRange("2026-09-16", range)).toBe(true);
    expect(isKeyInRange("2026-08-31", range)).toBe(false);
    expect(isKeyInRange("2026-09-17", range)).toBe(false);
  });

  it("range가 null이면 항상 true", () => {
    expect(isKeyInRange("1999-01-01", null)).toBe(true);
  });
});

describe("scopeTodosByProject", () => {
  const root = makeTodo({ id: "root" });
  const child = makeTodo({ id: "child", parentId: "root" });
  const other = makeTodo({ id: "other" });
  const otherChild = makeTodo({ id: "other-child", parentId: "other" });
  const todos = [root, child, other, otherChild];

  it("projectId가 null이면 전체를 돌려준다", () => {
    expect(scopeTodosByProject(todos, null)).toBe(todos);
  });

  it("루트 자신과 그 자식만 남긴다", () => {
    expect(scopeTodosByProject(todos, "root").map((t) => t.id)).toEqual(["root", "child"]);
  });

  it("자식이 없는 루트면 루트 하나만 남는다", () => {
    expect(scopeTodosByProject([root, other], "root").map((t) => t.id)).toEqual(["root"]);
  });
});

describe("scopeTodosByRange", () => {
  const range = { startKey: "2026-09-10", endKey: "2026-09-16" };

  it("range가 null이면 전체를 돌려준다(날짜 없는 항목 포함)", () => {
    const todos = [makeTodo({ id: "a" })];
    expect(scopeTodosByRange(todos, null)).toBe(todos);
  });

  it("dueAt이 기간 안이면 포함, 밖이면 제외한다", () => {
    const todos = [
      makeTodo({ id: "in", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "out", dueAt: "2026-09-01T12:00:00.000Z" }),
    ];
    expect(scopeTodosByRange(todos, range).map((t) => t.id)).toEqual(["in"]);
  });

  it("dueAt이 없으면 doneAt으로 판단한다", () => {
    const todos = [makeTodo({ id: "done", status: "done", doneAt: "2026-09-12T12:00:00.000Z" })];
    expect(scopeTodosByRange(todos, range).map((t) => t.id)).toEqual(["done"]);
  });

  it("dueAt/doneAt 둘 다 없으면 제외한다", () => {
    expect(scopeTodosByRange([makeTodo({ id: "none" })], range)).toEqual([]);
  });
});

describe("DEFAULT_INSIGHTS_FILTER", () => {
  it("이번 달 + 전체 프로젝트다", () => {
    expect(DEFAULT_INSIGHTS_FILTER).toEqual({ period: "thisMonth", projectId: null });
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/filter.test.ts`
Expected: FAIL — `Failed to resolve import "../filter"`

- [ ] **Step 7: `filter.ts` 구현**

`packages/core/src/insights/filter.ts`:

```ts
import type { Todo } from "../types/todo";
import { addDaysToKey, toDateKey, toDateKeyFromISO } from "./date";

export type PeriodPreset = "thisWeek" | "thisMonth" | "last90Days" | "all";

export interface InsightsFilter {
  period: PeriodPreset;
  /** 루트 할 일(parentId === null) id. null이면 전체 프로젝트. */
  projectId: string | null;
}

/** 로컬 날짜 키 범위, 양끝 포함. `all`이면 null. */
export type PeriodRange = { startKey: string; endKey: string } | null;

export const DEFAULT_INSIGHTS_FILTER: InsightsFilter = { period: "thisMonth", projectId: null };

/**
 * 프리셋 → 날짜 키 범위. 주 시작은 일요일(대시보드 캘린더의 FullCalendar 기본값과
 * 일치). 모든 범위는 오늘(now)로 끝난다.
 */
export const resolvePeriodRange = (period: PeriodPreset, now: Date = new Date()): PeriodRange => {
  const todayKey = toDateKey(now);
  switch (period) {
    case "thisWeek":
      return { startKey: addDaysToKey(todayKey, -now.getDay()), endKey: todayKey };
    case "thisMonth":
      return { startKey: `${todayKey.slice(0, 7)}-01`, endKey: todayKey };
    case "last90Days":
      return { startKey: addDaysToKey(todayKey, -89), endKey: todayKey };
    case "all":
      return null;
  }
};

/** yyyy-MM-dd는 사전순 == 시간순이라 문자열 비교로 충분하다. */
export const isKeyInRange = (key: string, range: PeriodRange): boolean =>
  range === null || (key >= range.startKey && key <= range.endKey);

/** 루트 자신 + 그 직계 자식만 남긴다. null이면 입력 배열을 그대로 돌려준다. */
export const scopeTodosByProject = (todos: Todo[], projectId: string | null): Todo[] =>
  projectId === null ? todos : todos.filter((t) => t.id === projectId || t.parentId === projectId);

/**
 * 기간 소속 판단 규칙(모든 기간 지표가 공유): dueAt(없으면 doneAt)이 범위 안이면
 * 포함. "이 기간에 처리했어야 할 일"을 뜻하기 위해 dueAt을 우선한다. 둘 다 없는
 * 항목(기한 없이 만들고 아직 완료 전)은 기간이 있으면 제외, `all`이면 포함.
 */
export const scopeTodosByRange = (todos: Todo[], range: PeriodRange): Todo[] => {
  if (range === null) return todos;
  return todos.filter((t) => {
    const anchor = t.dueAt ?? t.doneAt;
    return !!anchor && isKeyInRange(toDateKeyFromISO(anchor), range);
  });
};
```

- [ ] **Step 8: `insights/index.ts` + core `index.ts` export**

`packages/core/src/insights/index.ts`:

```ts
export * from "./date";
export * from "./filter";
```

`packages/core/src/index.ts`에 한 줄 추가:

```ts
export type { Todo, TodoFields, RecurrenceRule } from "./types/todo";
export { getTodos, createTodo, updateTodo, deleteTodo, calcParentStatus } from "./api/todoApi";
export * from "./insights";
```

- [ ] **Step 9: 테스트 통과 + 기존 테스트 회귀 확인**

Run: `cd packages/core && npm test`
Expected: PASS — 기존 11 + date 7 + filter 13 = 31 tests

- [ ] **Step 10: 커밋**

```bash
git add packages/core/src/insights packages/core/src/index.ts
git commit -m "feat(core): 인사이트 기간 프리셋/프로젝트 필터 순수 함수 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: core 지표 함수 이동 + 상태 구성 + 프로젝트 옵션

**Files:**
- Create: `packages/core/src/insights/metrics.ts`
- Modify: `packages/core/src/insights/index.ts`
- Test: `packages/core/src/insights/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: `scopeTodosByRange`, `PeriodRange` (Task 1), `toDateKey`/`toDateKeyFromISO` (Task 1)
- Produces:
  - `interface CompletionRateResult { completed: number; total: number; rate: number }`
  - `computeCompletionRate(todos: Todo[], range: PeriodRange): CompletionRateResult`
  - `computeStreak(todos: Todo[], now?: Date): number`
  - `interface PriorityDistribution { low: number; medium: number; high: number }`
  - `computePriorityDistribution(todos: Todo[], range: PeriodRange): PriorityDistribution`
  - `computeRecurringVsOneOffRate(todos: Todo[], range: PeriodRange): { recurring: CompletionRateResult; oneOff: CompletionRateResult }`
  - `computeDueAdherence(todos: Todo[], range: PeriodRange): CompletionRateResult`
  - `interface StatusBreakdown { todo: number; doing: number; done: number }`
  - `computeStatusBreakdown(projectScopedTodos: Todo[], projectId: string): StatusBreakdown`
  - `interface ProjectOption { id: string; title: string; isDone: boolean }`
  - `listProjectOptions(todos: Todo[]): ProjectOption[]`

- [ ] **Step 1: 실패 테스트 작성**

`packages/core/src/insights/__tests__/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import {
  computeCompletionRate,
  computeStreak,
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeDueAdherence,
  computeStatusBreakdown,
  listProjectOptions,
} from "../metrics";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "u1",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  recurrence: null,
  recurrenceId: null,
  ...overrides,
});

const range = { startKey: "2026-09-10", endKey: "2026-09-16" };

describe("computeCompletionRate", () => {
  it("range가 null이면 전체 todos를 스코프로 잡는다", () => {
    const todos = [
      makeTodo({ id: "1", status: "done" }),
      makeTodo({ id: "2" }),
      makeTodo({ id: "3" }),
    ];
    expect(computeCompletionRate(todos, null)).toEqual({ completed: 1, total: 3, rate: 1 / 3 });
  });

  it("dueAt이 범위 안인 항목만 센다", () => {
    const todos = [
      makeTodo({ id: "in", status: "done", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "out", status: "done", dueAt: "2026-08-01T12:00:00.000Z" }),
    ];
    expect(computeCompletionRate(todos, range)).toEqual({ completed: 1, total: 1, rate: 1 });
  });

  it("total이 0이면 rate는 0이다", () => {
    expect(computeCompletionRate([], range)).toEqual({ completed: 0, total: 0, rate: 0 });
  });
});

describe("computeStreak", () => {
  const now = new Date(2026, 8, 16, 15);
  const doneOn = (id: string, key: string) =>
    makeTodo({ id, status: "done", doneAt: `${key}T12:00:00.000Z` });

  it("오늘부터 거꾸로 연속 완료일을 센다", () => {
    const todos = [doneOn("1", "2026-09-16"), doneOn("2", "2026-09-15"), doneOn("3", "2026-09-13")];
    expect(computeStreak(todos, now)).toBe(2);
  });

  it("오늘 완료가 없어도 어제까지의 스트릭은 유지한다", () => {
    const todos = [doneOn("1", "2026-09-15"), doneOn("2", "2026-09-14")];
    expect(computeStreak(todos, now)).toBe(2);
  });

  it("오늘도 어제도 없으면 0이다", () => {
    expect(computeStreak([doneOn("1", "2026-09-10")], now)).toBe(0);
  });
});

describe("computePriorityDistribution", () => {
  it("범위 안 완료 항목만 우선순위별로 센다", () => {
    const todos = [
      makeTodo({ id: "1", status: "done", priority: "high", doneAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "2", status: "done", priority: "high", doneAt: "2026-08-12T12:00:00.000Z" }),
      makeTodo({ id: "3", status: "todo", priority: "low", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "4", status: "done", priority: "low", doneAt: "2026-09-11T12:00:00.000Z" }),
    ];
    expect(computePriorityDistribution(todos, range)).toEqual({ low: 1, medium: 0, high: 1 });
  });
});

describe("computeRecurringVsOneOffRate", () => {
  it("반복/단발을 나눠 범위 안 완료율을 낸다. recurrence undefined는 단발로 본다", () => {
    const todos = [
      makeTodo({
        id: "r1",
        status: "done",
        dueAt: "2026-09-12T12:00:00.000Z",
        recurrence: { type: "daily", endType: "indefinite" },
      }),
      makeTodo({ id: "o1", status: "todo", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "o2", status: "done", dueAt: "2026-09-12T12:00:00.000Z", recurrence: undefined }),
    ];
    expect(computeRecurringVsOneOffRate(todos, range)).toEqual({
      recurring: { completed: 1, total: 1, rate: 1 },
      oneOff: { completed: 1, total: 2, rate: 0.5 },
    });
  });
});

describe("computeDueAdherence", () => {
  it("dueAt·doneAt이 모두 있는 범위 안 완료 항목 중 제때 끝낸 비율", () => {
    const todos = [
      makeTodo({ id: "on", status: "done", dueAt: "2026-09-12T12:00:00.000Z", doneAt: "2026-09-12T10:00:00.000Z" }),
      makeTodo({ id: "late", status: "done", dueAt: "2026-09-12T12:00:00.000Z", doneAt: "2026-09-12T13:00:00.000Z" }),
      makeTodo({ id: "no-due", status: "done", dueAt: null, doneAt: "2026-09-12T13:00:00.000Z" }),
    ];
    expect(computeDueAdherence(todos, range)).toEqual({ completed: 1, total: 2, rate: 0.5 });
  });
});

describe("computeStatusBreakdown", () => {
  it("루트는 제외하고 자식만 상태별로 센다", () => {
    const scoped = [
      makeTodo({ id: "root", status: "doing" }),
      makeTodo({ id: "c1", parentId: "root", status: "todo" }),
      makeTodo({ id: "c2", parentId: "root", status: "doing" }),
      makeTodo({ id: "c3", parentId: "root", status: "done" }),
      makeTodo({ id: "c4", parentId: "root", status: "done" }),
    ];
    expect(computeStatusBreakdown(scoped, "root")).toEqual({ todo: 1, doing: 1, done: 2 });
  });

  it("자식이 없으면 루트 자신 1건으로 센다", () => {
    expect(computeStatusBreakdown([makeTodo({ id: "root", status: "done" })], "root")).toEqual({
      todo: 0,
      doing: 0,
      done: 1,
    });
  });
});

describe("listProjectOptions", () => {
  it("루트만, 진행 중 먼저 → 완료 순, 각 그룹은 updatedAt 내림차순", () => {
    const todos = [
      makeTodo({ id: "done-old", status: "done", title: "완료 오래됨", updatedAt: "2026-07-01T00:00:00.000Z" }),
      makeTodo({ id: "child", parentId: "active-new", title: "자식" }),
      makeTodo({ id: "active-old", status: "todo", title: "진행 오래됨", updatedAt: "2026-08-01T00:00:00.000Z" }),
      makeTodo({ id: "done-new", status: "done", title: "완료 최근", updatedAt: "2026-09-01T00:00:00.000Z" }),
      makeTodo({ id: "active-new", status: "doing", title: "진행 최근", updatedAt: "2026-09-10T00:00:00.000Z" }),
    ];
    expect(listProjectOptions(todos)).toEqual([
      { id: "active-new", title: "진행 최근", isDone: false },
      { id: "active-old", title: "진행 오래됨", isDone: false },
      { id: "done-new", title: "완료 최근", isDone: true },
      { id: "done-old", title: "완료 오래됨", isDone: true },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/metrics.test.ts`
Expected: FAIL — `Failed to resolve import "../metrics"`

- [ ] **Step 3: `metrics.ts` 구현**

`packages/core/src/insights/metrics.ts`:

```ts
import type { Todo } from "../types/todo";
import { toDateKey, toDateKeyFromISO } from "./date";
import { scopeTodosByRange, type PeriodRange } from "./filter";

export interface CompletionRateResult {
  completed: number;
  total: number;
  /** total이 0이면 0. */
  rate: number;
}

const toRate = (list: Todo[]): CompletionRateResult => {
  const completed = list.filter((todo) => todo.status === "done").length;
  return { completed, total: list.length, rate: list.length === 0 ? 0 : completed / list.length };
};

/** 기간 내 완료율. 기간 소속 규칙은 scopeTodosByRange 참고. */
export const computeCompletionRate = (todos: Todo[], range: PeriodRange): CompletionRateResult =>
  toRate(scopeTodosByRange(todos, range));

/**
 * 오늘부터 거꾸로 센 연속 완료일 수. 오늘 아직 완료가 없어도 어제까지 이어진
 * 스트릭은 끊지 않는다(오늘이 아직 안 끝났을 뿐일 수 있음). 기간/프로젝트 필터와
 * 무관하게 항상 전체 todos·전체 기간으로 계산한다 — 프로젝트별 연속 달성일은
 * 의미가 약하다.
 */
export const computeStreak = (todos: Todo[], now: Date = new Date()): number => {
  const doneDateKeys = new Set(
    todos
      .filter((todo) => todo.status === "done" && !!todo.doneAt)
      .map((todo) => toDateKeyFromISO(todo.doneAt as string)),
  );

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!doneDateKeys.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (doneDateKeys.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export interface PriorityDistribution {
  low: number;
  medium: number;
  high: number;
}

/** 범위 안 완료 항목만 대상으로 우선순위별 개수. */
export const computePriorityDistribution = (todos: Todo[], range: PeriodRange): PriorityDistribution => {
  const done = scopeTodosByRange(todos, range).filter((todo) => todo.status === "done");
  return {
    low: done.filter((todo) => todo.priority === "low").length,
    medium: done.filter((todo) => todo.priority === "medium").length,
    high: done.filter((todo) => todo.priority === "high").length,
  };
};

/**
 * 반복 vs 단발 완료율. 레거시 문서는 recurrence 필드 자체가 없어 undefined일 수
 * 있으므로 loose null 체크(`!= null`)로 "반복"을 판단한다.
 */
export const computeRecurringVsOneOffRate = (
  todos: Todo[],
  range: PeriodRange,
): { recurring: CompletionRateResult; oneOff: CompletionRateResult } => {
  const scoped = scopeTodosByRange(todos, range);
  return {
    recurring: toRate(scoped.filter((todo) => todo.recurrence != null)),
    oneOff: toRate(scoped.filter((todo) => todo.recurrence == null)),
  };
};

/** 기한 준수율 — dueAt·doneAt이 모두 있는 범위 안 완료 항목 중 마감 이내에 끝낸 비율. */
export const computeDueAdherence = (todos: Todo[], range: PeriodRange): CompletionRateResult => {
  const doneWithDue = scopeTodosByRange(todos, range).filter(
    (todo) => todo.status === "done" && !!todo.dueAt && !!todo.doneAt,
  );
  const onTime = doneWithDue.filter(
    (todo) => new Date(todo.doneAt as string).getTime() <= new Date(todo.dueAt as string).getTime(),
  );
  return {
    completed: onTime.length,
    total: doneWithDue.length,
    rate: doneWithDue.length === 0 ? 0 : onTime.length / doneWithDue.length,
  };
};

export interface StatusBreakdown {
  todo: number;
  doing: number;
  done: number;
}

/**
 * 프로젝트의 현재 상태 구성. 기간 필터를 타지 않는다("지금 어디쯤인가"). 루트의
 * status는 자식에서 도출되는 값이라 이중 계산을 피하려 자식만 세고, 자식이 없는
 * 루트면 루트 자신 1건을 센다.
 */
export const computeStatusBreakdown = (projectScopedTodos: Todo[], projectId: string): StatusBreakdown => {
  const children = projectScopedTodos.filter((todo) => todo.parentId === projectId);
  const target = children.length > 0 ? children : projectScopedTodos.filter((todo) => todo.id === projectId);
  return {
    todo: target.filter((todo) => todo.status === "todo").length,
    doing: target.filter((todo) => todo.status === "doing").length,
    done: target.filter((todo) => todo.status === "done").length,
  };
};

export interface ProjectOption {
  id: string;
  title: string;
  isDone: boolean;
}

/** 프로젝트 select 옵션: 루트만, 진행 중 먼저 → 완료 순, 각 그룹은 updatedAt 내림차순. */
export const listProjectOptions = (todos: Todo[]): ProjectOption[] =>
  todos
    .filter((todo) => todo.parentId === null)
    .sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .map((todo) => ({ id: todo.id, title: todo.title, isDone: todo.status === "done" }));
```

- [ ] **Step 4: `insights/index.ts`에 export 추가**

```ts
export * from "./date";
export * from "./filter";
export * from "./metrics";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd packages/core && npm test`
Expected: PASS — 31 + 11 = 42 tests

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/insights
git commit -m "feat(core): 인사이트 지표 함수를 core로 이동하고 기간 범위/상태 구성/프로젝트 옵션 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: core 완료 추이 버킷 + 라벨

**Files:**
- Create: `packages/core/src/insights/trend.ts`
- Create: `packages/core/src/insights/labels.ts`
- Modify: `packages/core/src/insights/index.ts`
- Modify: `docs/superpowers/specs/2026-09-20-insights-period-project-filter-design.md` (주 버킷 규칙 1줄)
- Test: `packages/core/src/insights/__tests__/trend.test.ts`

**Interfaces:**
- Consumes: `PeriodPreset`, `PeriodRange`, `isKeyInRange` (Task 1), 날짜 헬퍼 (Task 1)
- Produces:
  - `type TrendGranularity = "day" | "week" | "month"`
  - `interface TrendBucket { key: string; label: string; count: number }`
  - `resolveTrendGranularity(period: PeriodPreset): TrendGranularity`
  - `bucketCompletions(todos: Todo[], range: PeriodRange, granularity: TrendGranularity, now?: Date): TrendBucket[]`
  - `PERIOD_PRESETS: readonly PeriodPreset[]`, `PERIOD_TAB_LABELS: Record<PeriodPreset, string>`, `PERIOD_TITLE_LABELS: Record<PeriodPreset, string>`

- [ ] **Step 1: 실패 테스트 작성**

`packages/core/src/insights/__tests__/trend.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import { bucketCompletions, resolveTrendGranularity } from "../trend";
import { PERIOD_PRESETS, PERIOD_TAB_LABELS, PERIOD_TITLE_LABELS } from "../labels";
import { resolvePeriodRange } from "../filter";

const doneOn = (id: string, key: string): Todo => ({
  id,
  userId: "u1",
  title: "할 일",
  status: "done",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: `${key}T12:00:00.000Z`,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
});

// 2026-09-16 수요일
const now = new Date(2026, 8, 16, 15);

describe("resolveTrendGranularity", () => {
  it("주/월은 day, 90일은 week, 전체는 month", () => {
    expect(resolveTrendGranularity("thisWeek")).toBe("day");
    expect(resolveTrendGranularity("thisMonth")).toBe("day");
    expect(resolveTrendGranularity("last90Days")).toBe("week");
    expect(resolveTrendGranularity("all")).toBe("month");
  });
});

describe("bucketCompletions — day", () => {
  it("범위의 날마다 버킷을 만들고 빈 날은 0으로 채운다", () => {
    const range = resolvePeriodRange("thisWeek", now); // 09-13 ~ 09-16
    const todos = [doneOn("1", "2026-09-13"), doneOn("2", "2026-09-16"), doneOn("3", "2026-09-16")];

    expect(bucketCompletions(todos, range, "day", now)).toEqual([
      { key: "2026-09-13", label: "9/13", count: 1 },
      { key: "2026-09-14", label: "9/14", count: 0 },
      { key: "2026-09-15", label: "9/15", count: 0 },
      { key: "2026-09-16", label: "9/16", count: 2 },
    ]);
  });

  it("범위 밖 완료와 미완료는 세지 않는다", () => {
    const range = resolvePeriodRange("thisWeek", now);
    const notDone: Todo = { ...doneOn("x", "2026-09-14"), status: "todo" };
    const todos = [doneOn("1", "2026-09-12"), notDone];

    expect(bucketCompletions(todos, range, "day", now).every((b) => b.count === 0)).toBe(true);
  });
});

describe("bucketCompletions — week", () => {
  it("범위 시작일부터 7일 단위로 잘라 90일이면 13개, 라벨은 버킷 시작일", () => {
    const range = resolvePeriodRange("last90Days", now); // 06-19 ~ 09-16
    const todos = [doneOn("1", "2026-06-19"), doneOn("2", "2026-06-25"), doneOn("3", "2026-09-16")];

    const buckets = bucketCompletions(todos, range, "week", now);

    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toEqual({ key: "2026-06-19", label: "6/19", count: 2 });
    expect(buckets[1]).toEqual({ key: "2026-06-26", label: "6/26", count: 0 });
    expect(buckets[12]).toEqual({ key: "2026-09-11", label: "9/11", count: 1 });
  });
});

describe("bucketCompletions — month", () => {
  it("range가 null이면 첫 완료월부터 이번 달까지 월별로 센다", () => {
    const todos = [doneOn("1", "2026-07-03"), doneOn("2", "2026-09-01"), doneOn("3", "2026-09-10")];

    expect(bucketCompletions(todos, null, "month", now)).toEqual([
      { key: "2026-07", label: "2026.7", count: 1 },
      { key: "2026-08", label: "2026.8", count: 0 },
      { key: "2026-09", label: "2026.9", count: 2 },
    ]);
  });

  it("range가 null이고 완료가 0건이면 빈 배열", () => {
    expect(bucketCompletions([], null, "month", now)).toEqual([]);
  });

  it("연 경계를 넘는다", () => {
    const decNow = new Date(2027, 0, 5);
    const todos = [doneOn("1", "2026-12-20")];

    expect(bucketCompletions(todos, null, "month", decNow).map((b) => b.key)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("labels", () => {
  it("프리셋 순서와 라벨", () => {
    expect(PERIOD_PRESETS).toEqual(["thisWeek", "thisMonth", "last90Days", "all"]);
    expect(PERIOD_TAB_LABELS.all).toBe("전체");
    expect(PERIOD_TITLE_LABELS.all).toBe("전체 기간");
    expect(PERIOD_TITLE_LABELS.thisMonth).toBe("이번 달");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/trend.test.ts`
Expected: FAIL — `Failed to resolve import "../trend"`

- [ ] **Step 3: `trend.ts` 구현**

`packages/core/src/insights/trend.ts`:

```ts
import type { Todo } from "../types/todo";
import {
  addDaysToKey,
  addMonthsToMonthKey,
  diffDaysBetweenKeys,
  toDateKey,
  toDateKeyFromISO,
  toMonthKey,
} from "./date";
import { isKeyInRange, type PeriodPreset, type PeriodRange } from "./filter";

export type TrendGranularity = "day" | "week" | "month";

export interface TrendBucket {
  /** day/week: 버킷 시작 날짜 키. month: "yyyy-MM". */
  key: string;
  /** x축 라벨. day/week: "M/d", month: "yyyy.M". */
  label: string;
  count: number;
}

export const resolveTrendGranularity = (period: PeriodPreset): TrendGranularity => {
  if (period === "last90Days") return "week";
  if (period === "all") return "month";
  return "day";
};

const shortDayLabel = (key: string): string => {
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
};

const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  return `${year}.${Number(month)}`;
};

const doneDateKeys = (todos: Todo[]): string[] =>
  todos
    .filter((todo) => todo.status === "done" && !!todo.doneAt)
    .map((todo) => toDateKeyFromISO(todo.doneAt as string));

/**
 * 완료 추이 버킷. 완료 날짜(doneAt)를 기준으로 센다.
 * - day: 범위의 날마다 1개.
 * - week: 범위 시작일부터 7일 단위(일요일 정렬 X — 정렬하면 90일이 13개/14개로
 *   흔들려서 시작일 기준으로 고정). 마지막 버킷은 범위 끝에서 잘린다.
 * - month: 범위가 없으면(all) 첫 완료월 ~ now의 달. 완료 0건이면 빈 배열.
 * 빈 버킷은 0으로 채운다.
 */
export const bucketCompletions = (
  todos: Todo[],
  range: PeriodRange,
  granularity: TrendGranularity,
  now: Date = new Date(),
): TrendBucket[] => {
  const keys = doneDateKeys(todos);
  const todayKey = toDateKey(now);

  if (granularity === "month") {
    const startMonth = range ? toMonthKey(range.startKey) : keys.length === 0 ? null : toMonthKey([...keys].sort()[0]);
    if (startMonth === null) return [];
    const endMonth = toMonthKey(range?.endKey ?? todayKey);
    const countByMonth = new Map<string, number>();
    keys.forEach((key) => {
      const m = toMonthKey(key);
      countByMonth.set(m, (countByMonth.get(m) ?? 0) + 1);
    });
    const buckets: TrendBucket[] = [];
    for (let m = startMonth; m <= endMonth; m = addMonthsToMonthKey(m, 1)) {
      buckets.push({ key: m, label: monthLabel(m), count: countByMonth.get(m) ?? 0 });
    }
    return buckets;
  }

  const effective = range ?? (keys.length === 0 ? null : { startKey: [...keys].sort()[0], endKey: todayKey });
  if (effective === null) return [];
  const inRange = keys.filter((key) => isKeyInRange(key, effective));
  const totalDays = diffDaysBetweenKeys(effective.startKey, effective.endKey) + 1;
  const bucketSize = granularity === "week" ? 7 : 1;
  const bucketCount = Math.ceil(totalDays / bucketSize);

  const counts = new Array<number>(bucketCount).fill(0);
  inRange.forEach((key) => {
    const index = Math.floor(diffDaysBetweenKeys(effective.startKey, key) / bucketSize);
    counts[index] += 1;
  });

  return counts.map((count, i) => {
    const key = addDaysToKey(effective.startKey, i * bucketSize);
    return { key, label: shortDayLabel(key), count };
  });
};
```

- [ ] **Step 4: `labels.ts` 구현**

`packages/core/src/insights/labels.ts`:

```ts
import type { PeriodPreset } from "./filter";

export const PERIOD_PRESETS: readonly PeriodPreset[] = ["thisWeek", "thisMonth", "last90Days", "all"];

/** 필터 탭에 쓰는 짧은 라벨. */
export const PERIOD_TAB_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "이번 주",
  thisMonth: "이번 달",
  last90Days: "최근 90일",
  all: "전체",
};

/** 카드 제목 접두사("이번 달 완료 추이"). all만 "전체 기간"으로 읽히게 다르다. */
export const PERIOD_TITLE_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "이번 주",
  thisMonth: "이번 달",
  last90Days: "최근 90일",
  all: "전체 기간",
};
```

- [ ] **Step 5: `insights/index.ts` export 추가**

```ts
export * from "./date";
export * from "./filter";
export * from "./metrics";
export * from "./trend";
export * from "./labels";
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd packages/core && npm test`
Expected: PASS — 42 + 9 = 51 tests

- [ ] **Step 7: 스펙의 주 버킷 규칙 갱신**

`docs/superpowers/specs/2026-09-20-insights-period-project-filter-design.md`의 완료 추이 버킷 표에서 `| last90Days | 주(일요일 시작) | 13 |` 줄을 다음으로 교체:

```
| last90Days | 7일 단위(범위 시작일부터, 일요일 정렬 안 함 — 정렬하면 13/14개로 흔들림) | 13 |
```

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src/insights docs/superpowers/specs/2026-09-20-insights-period-project-filter-design.md
git commit -m "feat(core): 완료 추이 버킷(일/주/월)과 기간 라벨 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: core 차트 기하 3종 + dist 빌드

**Files:**
- Create: `packages/core/src/insights/chart/layoutBarChart.ts`
- Create: `packages/core/src/insights/chart/layoutHorizontalBars.ts`
- Create: `packages/core/src/insights/chart/layoutStackedBar.ts`
- Create: `packages/core/src/insights/chart/index.ts`
- Modify: `packages/core/src/insights/index.ts`
- Modify: `packages/core/dist/**` (빌드 산출물, 커밋 대상)
- Test: `packages/core/src/insights/__tests__/chart.test.ts`

**Interfaces:**
- Produces:
  - `interface BarChartPoint { label: string; value: number }`
  - `interface BarChartLayout { bars: { x; y; w; h; value; label }[]; yTicks: { y; value }[]; xLabels: { x; text; visible }[]; baselineY: number; plotLeft: number; plotRight: number }`
  - `layoutBarChart({ points, width, height, padding? }): BarChartLayout`
  - `niceStep(rawStep: number): number`
  - `interface HorizontalBarRow { label: string; value: number }`
  - `interface HorizontalBarLayoutRow extends HorizontalBarRow { fillWidth: number; ratio: number }`
  - `layoutHorizontalBars({ rows, width }): HorizontalBarLayoutRow[]`
  - `interface StackedBarSegment { key: string; label: string; value: number }`
  - `interface StackedBarLayout { total: number; segments: (StackedBarSegment & { x: number; w: number; ratio: number })[] }`
  - `layoutStackedBar({ segments, width }): StackedBarLayout`

- [ ] **Step 1: 실패 테스트 작성**

`packages/core/src/insights/__tests__/chart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { layoutBarChart, niceStep } from "../chart/layoutBarChart";
import { layoutHorizontalBars } from "../chart/layoutHorizontalBars";
import { layoutStackedBar } from "../chart/layoutStackedBar";

describe("niceStep", () => {
  it("1·2·5×10^n 중 rawStep 이상인 가장 작은 값, 최소 1", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(4.3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(34)).toBe(50);
  });
});

describe("layoutBarChart", () => {
  const points = [
    { label: "9/1", value: 1 },
    { label: "9/2", value: 0 },
    { label: "9/3", value: 5 },
    { label: "9/4", value: 3 },
  ];

  it("width나 height가 0 이하이거나 points가 비면 빈 레이아웃", () => {
    const empty = { bars: [], yTicks: [], xLabels: [], baselineY: 0, plotLeft: 0, plotRight: 0 };
    expect(layoutBarChart({ points, width: 0, height: 160 })).toEqual(empty);
    expect(layoutBarChart({ points, width: 320, height: 0 })).toEqual(empty);
    expect(layoutBarChart({ points: [], width: 320, height: 160 })).toEqual(empty);
  });

  it("최대값 5 → 눈금 0,2,4,6이고 가장 높은 막대는 6 기준 비율로 그려진다", () => {
    const layout = layoutBarChart({ points, width: 320, height: 160, padding: { top: 0, right: 0, bottom: 0, left: 0 } });

    expect(layout.yTicks.map((t) => t.value)).toEqual([0, 2, 4, 6]);
    expect(layout.baselineY).toBe(160);
    expect(layout.yTicks[0].y).toBe(160);
    expect(layout.yTicks[3].y).toBe(0);

    const tallest = layout.bars[2];
    expect(tallest.value).toBe(5);
    expect(tallest.h).toBeCloseTo((5 / 6) * 160);
    expect(tallest.y).toBeCloseTo(160 - (5 / 6) * 160);
    expect(layout.bars[1].h).toBe(0);
  });

  it("막대는 plot 폭을 n등분한 슬롯 안에 가운데 정렬되고 서로 겹치지 않는다", () => {
    const layout = layoutBarChart({ points, width: 400, height: 100, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    const slot = 100;
    layout.bars.forEach((bar, i) => {
      expect(bar.w).toBeLessThan(slot);
      expect(bar.x).toBeGreaterThanOrEqual(i * slot);
      expect(bar.x + bar.w).toBeLessThanOrEqual((i + 1) * slot);
    });
  });

  it("전부 0이어도 눈금 0,1이 생기고 막대 높이는 0", () => {
    const layout = layoutBarChart({ points: [{ label: "a", value: 0 }, { label: "b", value: 0 }], width: 100, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(layout.yTicks.map((t) => t.value)).toEqual([0, 1]);
    expect(layout.bars.every((b) => b.h === 0)).toBe(true);
  });

  it("x 라벨은 폭이 좁으면 k개마다 보이고 마지막은 항상 보이며, 마지막과 k 미만으로 가까운 라벨은 숨긴다", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `d${i}`, value: 1 }));
    // plotWidth 96, LABEL_WIDTH 32 → k = ceil(8*32/96) = 3
    const layout = layoutBarChart({ points: many, width: 96, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    const visible = layout.xLabels.filter((l) => l.visible).map((l) => l.text);
    expect(visible).toEqual(["d0", "d3", "d7"]);
  });

  it("폭이 충분하면 모든 라벨이 보인다", () => {
    const layout = layoutBarChart({ points, width: 400, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(layout.xLabels.every((l) => l.visible)).toBe(true);
  });
});

describe("layoutHorizontalBars", () => {
  const rows = [
    { label: "높음", value: 3 },
    { label: "보통", value: 6 },
    { label: "낮음", value: 1 },
  ];

  it("width가 0 이하면 빈 배열", () => {
    expect(layoutHorizontalBars({ rows, width: 0 })).toEqual([]);
  });

  it("fillWidth는 최대값 대비, ratio는 합계 대비", () => {
    const layout = layoutHorizontalBars({ rows, width: 200 });
    expect(layout[1]).toEqual({ label: "보통", value: 6, fillWidth: 200, ratio: 0.6 });
    expect(layout[0].fillWidth).toBe(100);
    expect(layout[0].ratio).toBeCloseTo(0.3);
  });

  it("전부 0이면 fillWidth/ratio 모두 0 (0으로 나누기 없음)", () => {
    const layout = layoutHorizontalBars({ rows: rows.map((r) => ({ ...r, value: 0 })), width: 200 });
    expect(layout.every((r) => r.fillWidth === 0 && r.ratio === 0)).toBe(true);
  });
});

describe("layoutStackedBar", () => {
  const segments = [
    { key: "todo", label: "할 일", value: 1 },
    { key: "doing", label: "진행 중", value: 0 },
    { key: "done", label: "완료", value: 3 },
  ];

  it("width가 0 이하거나 합계가 0이면 세그먼트 없음", () => {
    expect(layoutStackedBar({ segments, width: 0 })).toEqual({ total: 4, segments: [] });
    expect(layoutStackedBar({ segments: segments.map((s) => ({ ...s, value: 0 })), width: 100 })).toEqual({ total: 0, segments: [] });
  });

  it("0인 세그먼트를 빼고 왼쪽부터 이어 붙인다", () => {
    const layout = layoutStackedBar({ segments, width: 100 });
    expect(layout.total).toBe(4);
    expect(layout.segments.map((s) => s.key)).toEqual(["todo", "done"]);
    expect(layout.segments[0]).toEqual({ key: "todo", label: "할 일", value: 1, x: 0, w: 25, ratio: 0.25 });
    expect(layout.segments[1]).toEqual({ key: "done", label: "완료", value: 3, x: 25, w: 75, ratio: 0.75 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/insights/__tests__/chart.test.ts`
Expected: FAIL — `Failed to resolve import "../chart/layoutBarChart"`

- [ ] **Step 3: `layoutBarChart.ts` 구현**

`packages/core/src/insights/chart/layoutBarChart.ts`:

```ts
/**
 * 세로 막대 차트 기하. 픽셀 단위 숫자만 돌려주고 그리기는 각 플랫폼(웹 <svg>,
 * RN react-native-svg)이 담당한다.
 */

export interface BarChartPoint {
  label: string;
  value: number;
}

export interface BarChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BarChartBar {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  label: string;
}

export interface BarChartLayout {
  bars: BarChartBar[];
  yTicks: { y: number; value: number }[];
  xLabels: { x: number; text: string; visible: boolean }[];
  baselineY: number;
  plotLeft: number;
  plotRight: number;
}

export interface BarChartLayoutInput {
  points: BarChartPoint[];
  width: number;
  height: number;
  padding?: BarChartPadding;
}

/** 왼쪽은 y 눈금 숫자, 아래는 x 라벨 자리. */
export const DEFAULT_BAR_CHART_PADDING: BarChartPadding = { top: 8, right: 8, bottom: 20, left: 28 };

/** x 라벨 한 개가 차지한다고 보는 폭(px). "9/14" 4글자 10px 폰트 기준 여유 포함. */
const LABEL_WIDTH = 32;
/** 슬롯 폭 중 막대 사이 간격 비율. */
const BAR_GAP_RATIO = 0.3;
/** y 눈금 목표 개수(0 제외). */
const TARGET_TICKS = 3;

const EMPTY: BarChartLayout = { bars: [], yTicks: [], xLabels: [], baselineY: 0, plotLeft: 0, plotRight: 0 };

/**
 * "nice number" 눈금 간격: rawStep 이상인 1·2·5×10^n 중 가장 작은 값. 값이 건수
 * (정수)라 최소 1로 고정해서 0.5 같은 눈금이 나오지 않게 한다.
 */
export const niceStep = (rawStep: number): number => {
  if (rawStep <= 1) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
};

export const layoutBarChart = ({
  points,
  width,
  height,
  padding = DEFAULT_BAR_CHART_PADDING,
}: BarChartLayoutInput): BarChartLayout => {
  if (width <= 0 || height <= 0 || points.length === 0) return EMPTY;

  const plotLeft = padding.left;
  const plotRight = width - padding.right;
  const plotTop = padding.top;
  const baselineY = height - padding.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = baselineY - plotTop;
  if (plotWidth <= 0 || plotHeight <= 0) return EMPTY;

  const max = Math.max(0, ...points.map((p) => p.value));
  const step = niceStep(max / TARGET_TICKS);
  const yMax = Math.max(step, Math.ceil(max / step) * step);

  const yTicks: BarChartLayout["yTicks"] = [];
  for (let value = 0; value <= yMax; value += step) {
    yTicks.push({ value, y: baselineY - (value / yMax) * plotHeight });
  }

  const n = points.length;
  const slot = plotWidth / n;
  const barWidth = slot * (1 - BAR_GAP_RATIO);
  const bars = points.map((p, i) => {
    const h = (p.value / yMax) * plotHeight;
    return {
      x: plotLeft + i * slot + (slot - barWidth) / 2,
      y: baselineY - h,
      w: barWidth,
      h,
      value: p.value,
      label: p.label,
    };
  });

  // 라벨이 겹치지 않게 k개마다 하나만 보이되 마지막은 항상 보인다. 마지막과 k 미만으로
  // 가까운 "k의 배수" 라벨은 마지막과 겹치므로 숨긴다.
  const k = Math.max(1, Math.ceil((n * LABEL_WIDTH) / plotWidth));
  const xLabels = points.map((p, i) => ({
    x: plotLeft + i * slot + slot / 2,
    text: p.label,
    visible: i === n - 1 || (i % k === 0 && n - 1 - i >= k),
  }));

  return { bars, yTicks, xLabels, baselineY, plotLeft, plotRight };
};
```

- [ ] **Step 4: `layoutHorizontalBars.ts` 구현**

`packages/core/src/insights/chart/layoutHorizontalBars.ts`:

```ts
export interface HorizontalBarRow {
  label: string;
  value: number;
}

export interface HorizontalBarLayoutRow extends HorizontalBarRow {
  /** 트랙 폭(width) 기준 채움 폭. 최대값 행이 width. */
  fillWidth: number;
  /** 합계 대비 비율(0~1). 라벨의 % 표기에 쓴다. */
  ratio: number;
}

export interface HorizontalBarsLayoutInput {
  rows: HorizontalBarRow[];
  /** 막대 트랙의 폭(라벨/숫자 칸을 제외한 순수 막대 영역). */
  width: number;
}

export const layoutHorizontalBars = ({ rows, width }: HorizontalBarsLayoutInput): HorizontalBarLayoutRow[] => {
  if (width <= 0) return [];
  const max = Math.max(0, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return rows.map((r) => ({
    ...r,
    fillWidth: max === 0 ? 0 : (r.value / max) * width,
    ratio: total === 0 ? 0 : r.value / total,
  }));
};
```

- [ ] **Step 5: `layoutStackedBar.ts` 구현**

`packages/core/src/insights/chart/layoutStackedBar.ts`:

```ts
export interface StackedBarSegment {
  key: string;
  label: string;
  value: number;
}

export interface StackedBarLayoutSegment extends StackedBarSegment {
  x: number;
  w: number;
  ratio: number;
}

export interface StackedBarLayout {
  total: number;
  /** 값이 0인 세그먼트는 제외. 왼쪽부터 입력 순서대로 이어 붙는다. */
  segments: StackedBarLayoutSegment[];
}

export interface StackedBarLayoutInput {
  segments: StackedBarSegment[];
  width: number;
}

export const layoutStackedBar = ({ segments, width }: StackedBarLayoutInput): StackedBarLayout => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (width <= 0 || total === 0) return { total, segments: [] };

  let x = 0;
  const laidOut = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const w = (s.value / total) * width;
      const segment = { ...s, x, w, ratio: s.value / total };
      x += w;
      return segment;
    });
  return { total, segments: laidOut };
};
```

- [ ] **Step 6: `chart/index.ts` + `insights/index.ts` export**

`packages/core/src/insights/chart/index.ts`:

```ts
export * from "./layoutBarChart";
export * from "./layoutHorizontalBars";
export * from "./layoutStackedBar";
```

`packages/core/src/insights/index.ts`:

```ts
export * from "./date";
export * from "./filter";
export * from "./metrics";
export * from "./trend";
export * from "./labels";
export * from "./chart";
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd packages/core && npm test`
Expected: PASS — 51 + 12 = 63 tests

- [ ] **Step 8: dist 빌드 + client에서 새 export가 보이는지 확인**

Run: `cd packages/core && npm run build && ls dist/insights/chart && cd ../../client && npx tsc -b --noEmit`
Expected: `dist/insights/chart/` 아래 `.js`/`.d.ts` 생성, client 타입체크 통과(아직 client는 core insights를 안 쓰므로 변경 없음)

- [ ] **Step 9: 커밋 (dist 포함)**

```bash
git add packages/core/src/insights packages/core/dist
git commit -m "feat(core): 차트 기하 계산(세로/가로/누적 막대) 추가 및 dist 빌드

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 웹 `useElementWidth` + SVG 차트 렌더러 3종

**Files:**
- Create: `client/src/shared/hooks/useElementWidth.ts`
- Modify: `client/src/shared/hooks/index.ts`
- Create: `client/src/features/insights/components/charts/barChart.tsx`
- Create: `client/src/features/insights/components/charts/horizontalBars.tsx`
- Create: `client/src/features/insights/components/charts/stackedBar.tsx`
- Create: `client/src/features/insights/components/charts/index.ts`
- Test: `client/src/shared/hooks/__tests__/useElementWidth.test.tsx`
- Test: `client/src/features/insights/components/charts/__tests__/barChart.test.tsx`
- Test: `client/src/features/insights/components/charts/__tests__/horizontalBars.test.tsx`
- Test: `client/src/features/insights/components/charts/__tests__/stackedBar.test.tsx`

**Interfaces:**
- Consumes: `layoutBarChart`, `layoutHorizontalBars`, `layoutStackedBar` 및 타입 (Task 4, `@tododo/core`)
- Produces:
  - `useElementWidth<T extends HTMLElement = HTMLDivElement>(): { ref: RefObject<T | null>; width: number }`
  - `<BarChart points width height? ariaLabel formatTitle? />`
  - `<HorizontalBars rows width ariaLabel />`
  - `<StackedBar segments colorOf width ariaLabel />`

- [ ] **Step 1: `dataviz` 스킬 로드**

`Skill` 도구로 `dataviz`를 호출해 마크/축/색 규칙을 읽는다. 이 태스크의 렌더러는 스펙의 토큰 결정(막대 `brand.strong`, 눈금 `border.tertiary`, 라벨 `text.tertiary`)을 따르되, 스킬이 지적하는 접근성 규칙(role/aria-label, 색만으로 범주 구분 금지 → 상태 막대는 범례 텍스트 병기)과 충돌하면 스킬 쪽을 따른다. 색 값 자체는 바꾸지 않는다.

- [ ] **Step 2: `useElementWidth` 실패 테스트**

`client/src/shared/hooks/__tests__/useElementWidth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import useElementWidth from "../useElementWidth";

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void;
let lastCallback: ResizeCallback | null = null;

const Probe = () => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  return <div ref={ref} data-testid="probe">{width}</div>;
};

describe("useElementWidth", () => {
  beforeAll(() => {
    // jsdom에는 ResizeObserver가 없다
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeCallback) {
        lastCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    lastCallback = null;
  });

  it("마운트 시 getBoundingClientRect 너비로 초기화한다", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 240 } as DOMRect);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("240");
  });

  it("ResizeObserver 콜백이 오면 너비를 갱신한다", () => {
    render(<Probe />);
    act(() => {
      lastCallback?.([{ contentRect: { width: 512 } }]);
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("512");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/shared/hooks/__tests__/useElementWidth.test.tsx`
Expected: FAIL — `Failed to resolve import "../useElementWidth"`

- [ ] **Step 4: `useElementWidth.ts` 구현 + index export**

`client/src/shared/hooks/useElementWidth.ts`:

```ts
import { useEffect, useRef, useState } from "react";

/**
 * ref를 단 요소의 콘텐츠 너비를 ResizeObserver로 추적한다. SVG 차트가 컨테이너
 * 폭에 맞춰 기하를 다시 계산하도록 숫자 너비가 필요해서 만든 훅 —
 * dashboard/components/calendar.tsx가 인라인으로 쓰던 것과 같은 패턴.
 * 첫 렌더에서는 0이므로 호출부는 width 0일 때 차트를 그리지 않아야 한다.
 */
const useElementWidth = <T extends HTMLElement = HTMLDivElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
};

export default useElementWidth;
```

`client/src/shared/hooks/index.ts`에 추가:

```ts
export { default as useElementWidth } from "./useElementWidth";
```

- [ ] **Step 5: 훅 테스트 통과 확인**

Run: `cd client && npx vitest run src/shared/hooks/__tests__/useElementWidth.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: 차트 렌더러 실패 테스트 3개**

`client/src/features/insights/components/charts/__tests__/barChart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BarChart from "../barChart";

const points = [
  { label: "9/1", value: 1 },
  { label: "9/2", value: 0 },
  { label: "9/3", value: 5 },
];

describe("BarChart", () => {
  it("role=img + aria-label로 노출되고 포인트 수만큼 막대(rect)를 그린다", () => {
    const { container } = render(<BarChart points={points} width={320} ariaLabel="이번 달 완료 추이" />);

    expect(screen.getByRole("img", { name: "이번 달 완료 추이" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("막대마다 title로 값을 노출한다", () => {
    render(<BarChart points={points} width={320} ariaLabel="추이" formatTitle={(label, value) => `${label}: ${value}건 완료`} />);

    expect(screen.getByTitle("9/3: 5건 완료")).toBeInTheDocument();
  });

  it("y 눈금 숫자와 x 라벨 텍스트를 그린다", () => {
    render(<BarChart points={points} width={320} ariaLabel="추이" />);

    expect(screen.getByText("6")).toBeInTheDocument(); // 최대값 5 → yMax 6
    expect(screen.getByText("9/1")).toBeInTheDocument();
    expect(screen.getByText("9/3")).toBeInTheDocument();
  });

  it("width가 0이면 아무것도 그리지 않는다", () => {
    const { container } = render(<BarChart points={points} width={0} ariaLabel="추이" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

`client/src/features/insights/components/charts/__tests__/horizontalBars.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HorizontalBars from "../horizontalBars";

const rows = [
  { label: "높음", value: 3 },
  { label: "보통", value: 6 },
  { label: "낮음", value: 1 },
];

describe("HorizontalBars", () => {
  it("행마다 라벨과 '값 (비율%)'을 그린다", () => {
    render(<HorizontalBars rows={rows} width={320} ariaLabel="우선순위 분포" />);

    expect(screen.getByRole("img", { name: "우선순위 분포" })).toBeInTheDocument();
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getByText("3 (30%)")).toBeInTheDocument();
    expect(screen.getByText("6 (60%)")).toBeInTheDocument();
    expect(screen.getByText("1 (10%)")).toBeInTheDocument();
  });

  it("전부 0이어도 0 (0%)로 그린다", () => {
    render(<HorizontalBars rows={rows.map((r) => ({ ...r, value: 0 }))} width={320} ariaLabel="분포" />);
    expect(screen.getAllByText("0 (0%)")).toHaveLength(3);
  });

  it("width가 0이면 아무것도 그리지 않는다", () => {
    const { container } = render(<HorizontalBars rows={rows} width={0} ariaLabel="분포" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

`client/src/features/insights/components/charts/__tests__/stackedBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StackedBar from "../stackedBar";

const segments = [
  { key: "todo", label: "할 일", value: 1 },
  { key: "doing", label: "진행 중", value: 0 },
  { key: "done", label: "완료", value: 3 },
];
const colorOf = (key: string) => (key === "done" ? "#6d28d9" : "#4b5563");

describe("StackedBar", () => {
  it("0이 아닌 세그먼트만 rect로 그리고 title에 건수·비율을 넣는다", () => {
    const { container } = render(<StackedBar segments={segments} colorOf={colorOf} width={200} ariaLabel="상태 구성" />);

    expect(screen.getByRole("img", { name: "상태 구성" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(2);
    expect(screen.getByTitle("완료 3건 (75%)")).toBeInTheDocument();
  });

  it("합계가 0이거나 width가 0이면 아무것도 그리지 않는다", () => {
    const zero = segments.map((s) => ({ ...s, value: 0 }));
    expect(render(<StackedBar segments={zero} colorOf={colorOf} width={200} ariaLabel="x" />).container.querySelector("svg")).toBeNull();
    expect(render(<StackedBar segments={segments} colorOf={colorOf} width={0} ariaLabel="x" />).container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 7: 실패 확인**

Run: `cd client && npx vitest run src/features/insights/components/charts`
Expected: FAIL — 세 파일 모두 `Failed to resolve import`

- [ ] **Step 8: 렌더러 구현**

`client/src/features/insights/components/charts/barChart.tsx`:

```tsx
import { layoutBarChart, type BarChartPoint } from "@tododo/core";
import { colors } from "@/styles/colors";

interface BarChartProps {
  points: BarChartPoint[];
  /** 컨테이너 측정 너비. 0이면 아무것도 그리지 않는다(측정 전 첫 렌더). */
  width: number;
  height?: number;
  ariaLabel: string;
  /** 막대 hover/보조기기용 <title> 문구. */
  formatTitle?: (label: string, value: number) => string;
}

const DEFAULT_HEIGHT = 160;
const defaultFormatTitle = (label: string, value: number) => `${label}: ${value}`;

/**
 * 세로 막대 차트. 기하는 전부 core의 layoutBarChart가 계산하고 여기서는 숫자를
 * <svg>에 옮겨 그리기만 한다 — 같은 레이아웃을 RN에서 react-native-svg로 그리기 위함.
 */
const BarChart = ({ points, width, height = DEFAULT_HEIGHT, ariaLabel, formatTitle = defaultFormatTitle }: BarChartProps) => {
  const layout = layoutBarChart({ points, width, height });
  if (layout.bars.length === 0) return null;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      {layout.yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={layout.plotLeft} x2={layout.plotRight} y1={tick.y} y2={tick.y} stroke={colors.border.tertiary} strokeWidth={1} />
          <text x={layout.plotLeft - 6} y={tick.y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={colors.text.tertiary}>
            {tick.value}
          </text>
        </g>
      ))}
      {layout.bars.map((bar) => (
        <rect key={bar.label} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3} fill={colors.brand.strong}>
          <title>{formatTitle(bar.label, bar.value)}</title>
        </rect>
      ))}
      {layout.xLabels
        .filter((label) => label.visible)
        .map((label) => (
          <text key={label.text} x={label.x} y={layout.baselineY + 14} textAnchor="middle" fontSize={10} fill={colors.text.tertiary}>
            {label.text}
          </text>
        ))}
    </svg>
  );
};

export default BarChart;
export type { BarChartProps };
```

`client/src/features/insights/components/charts/horizontalBars.tsx`:

```tsx
import { layoutHorizontalBars, type HorizontalBarRow } from "@tododo/core";
import { colors } from "@/styles/colors";

interface HorizontalBarsProps {
  rows: HorizontalBarRow[];
  /** 컨테이너 측정 너비(라벨/숫자 칸 포함 전체). 0이면 그리지 않는다. */
  width: number;
  ariaLabel: string;
}

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 40;
const VALUE_WIDTH = 64;
const GAP = 8;
const TRACK_HEIGHT = 8;

/** 가로 막대 목록. 텍스트가 범주를, 막대는 크기만 인코딩한다(단일 색). */
const HorizontalBars = ({ rows, width, ariaLabel }: HorizontalBarsProps) => {
  const trackX = LABEL_WIDTH + GAP;
  const trackWidth = width - trackX - GAP - VALUE_WIDTH;
  const layout = layoutHorizontalBars({ rows, width: trackWidth });
  if (layout.length === 0) return null;

  const height = rows.length * ROW_HEIGHT;
  const trackY = ROW_HEIGHT / 2 - TRACK_HEIGHT / 2;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      {layout.map((row, i) => {
        const y = i * ROW_HEIGHT;
        const valueText = `${row.value} (${Math.round(row.ratio * 100)}%)`;
        return (
          <g key={row.label}>
            <text x={0} y={y + ROW_HEIGHT / 2} dominantBaseline="middle" fontSize={13} fontWeight={500} fill={colors.text.secondary}>
              {row.label}
            </text>
            <rect x={trackX} y={y + trackY} width={trackWidth} height={TRACK_HEIGHT} rx={4} fill={colors.background.secondary} />
            <rect x={trackX} y={y + trackY} width={row.fillWidth} height={TRACK_HEIGHT} rx={4} fill={colors.brand.strong}>
              <title>{`${row.label} ${valueText}`}</title>
            </rect>
            <text x={width} y={y + ROW_HEIGHT / 2} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight={500} fill={colors.text.primary}>
              {valueText}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default HorizontalBars;
export type { HorizontalBarsProps };
```

`client/src/features/insights/components/charts/stackedBar.tsx`:

```tsx
import { layoutStackedBar, type StackedBarSegment } from "@tododo/core";

interface StackedBarProps {
  segments: StackedBarSegment[];
  colorOf: (key: string) => string;
  /** 컨테이너 측정 너비. 0이면 그리지 않는다. */
  width: number;
  ariaLabel: string;
}

const HEIGHT = 24;
const RADIUS = 6;

/** 한 줄짜리 누적 막대. 색만으로 구분하지 않도록 호출부가 범례 텍스트를 함께 둔다. */
const StackedBar = ({ segments, colorOf, width, ariaLabel }: StackedBarProps) => {
  const layout = layoutStackedBar({ segments, width });
  if (layout.segments.length === 0) return null;

  const clipId = `stacked-bar-clip-${ariaLabel.replace(/\s+/g, "-")}`;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={HEIGHT} rx={RADIUS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {layout.segments.map((segment) => (
          <rect key={segment.key} x={segment.x} y={0} width={segment.w} height={HEIGHT} fill={colorOf(segment.key)}>
            <title>{`${segment.label} ${segment.value}건 (${Math.round(segment.ratio * 100)}%)`}</title>
          </rect>
        ))}
      </g>
    </svg>
  );
};

export default StackedBar;
export type { StackedBarProps };
```

`client/src/features/insights/components/charts/index.ts`:

```ts
export { default as BarChart } from "./barChart";
export { default as HorizontalBars } from "./horizontalBars";
export { default as StackedBar } from "./stackedBar";
```

- [ ] **Step 9: 렌더러 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/insights/components/charts src/shared/hooks`
Expected: PASS (barChart 4, horizontalBars 3, stackedBar 2, useElementWidth 2 + 기존 hooks 테스트)

- [ ] **Step 10: 커밋**

```bash
git add client/src/shared/hooks client/src/features/insights/components/charts
git commit -m "feat(insights): 컨테이너 너비 측정 훅과 SVG 차트 렌더러(세로/가로/누적 막대) 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 웹 데이터 파이프라인을 core로 전환 + 카드 컴포넌트 교체

이 태스크가 끝나면 페이지는 `DEFAULT_INSIGHTS_FILTER` 고정으로 새 파이프라인과 SVG 차트로 렌더링된다(필터 UI는 Task 7).

**Files:**
- Delete: `client/src/features/insights/utils/` (디렉터리 전체 — `computeCompletionRate.ts`, `computeCompletionTrend.ts`, `computeDistribution.ts`, `computeStreak.ts`, `__tests__/*`)
- Modify: `client/src/features/insights/hooks/useProductivityMetrics.ts`
- Modify: `client/src/features/insights/components/insightsSummaryCards.tsx`
- Modify: `client/src/features/insights/components/completionTrend.tsx`, `completionTrend.styles.tsx`
- Modify: `client/src/features/insights/components/priorityDistribution.tsx`, `priorityDistribution.styles.tsx`
- Modify: `client/src/features/insights/components/streakCard.tsx`, `streakCard.styles.tsx`
- Modify: `client/src/features/insights/pages/insightsPage.tsx`
- Test: `client/src/features/insights/components/__tests__/insightsSummaryCards.test.tsx`, `completionTrend.test.tsx`, `priorityDistribution.test.tsx`, `streakCard.test.tsx`
- Test: `client/src/features/insights/pages/__tests__/insightsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1~4의 core export 전부(`@tododo/core`), Task 5의 `BarChart`/`HorizontalBars`, `useElementWidth`
- Produces:
  - `useProductivityMetrics(filter: InsightsFilter)` → `{ completionRate, dueAdherence, recurringVsOneOff, priorityDistribution, trend: TrendBucket[], streak, statusBreakdown: StatusBreakdown | null, projects: ProjectOption[], isLoading, isError }`
  - `<InsightsSummaryCards periodLabel completionRate dueAdherence recurringVsOneOff />`
  - `<CompletionTrend buckets title />`
  - `<PriorityDistribution distribution title />`

- [ ] **Step 1: 카드 컴포넌트 테스트를 새 계약으로 수정 (실패 상태)**

`client/src/features/insights/components/__tests__/insightsSummaryCards.test.tsx` 전체 교체:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InsightsSummaryCards from "../insightsSummaryCards";

describe("InsightsSummaryCards", () => {
  it("선택 기간 완료율·기한 준수율·반복/일반 완료율을 퍼센트와 completed/total로 렌더링한다", () => {
    render(
      <InsightsSummaryCards
        periodLabel="이번 달"
        completionRate={{ completed: 3, total: 4, rate: 0.75 }}
        dueAdherence={{ completed: 8, total: 10, rate: 0.8 }}
        recurringVsOneOff={{
          recurring: { completed: 5, total: 5, rate: 1 },
          oneOff: { completed: 3, total: 5, rate: 0.6 },
        }}
      />,
    );

    expect(screen.getByText("이번 달 완료율")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3 / 4")).toBeInTheDocument();
    expect(screen.getByText("기한 준수율")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("반복 할 일 완료율")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("일반 할 일 완료율")).toBeInTheDocument();
    expect(screen.queryByText(/최근 7일/)).not.toBeInTheDocument();
  });
});
```

`client/src/features/insights/components/__tests__/completionTrend.test.tsx` 전체 교체:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CompletionTrend from "../completionTrend";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 320 }),
}));

describe("CompletionTrend", () => {
  it("제목과 버킷 막대를 그린다", () => {
    const buckets = [
      { key: "2026-09-01", label: "9/1", count: 1 },
      { key: "2026-09-02", label: "9/2", count: 0 },
      { key: "2026-09-03", label: "9/3", count: 2 },
    ];

    const { container } = render(<CompletionTrend buckets={buckets} title="이번 달 완료 추이" />);

    expect(screen.getByText("이번 달 완료 추이")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /이번 달 완료 추이/ })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(screen.getByTitle("9/3: 2건 완료")).toBeInTheDocument();
  });

  it("버킷이 비면 빈 상태를 보여준다", () => {
    render(<CompletionTrend buckets={[]} title="전체 기간 완료 추이" />);

    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("버킷이 전부 0이어도 빈 상태를 보여준다", () => {
    render(<CompletionTrend buckets={[{ key: "2026-09-01", label: "9/1", count: 0 }]} title="이번 주 완료 추이" />);

    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeInTheDocument();
  });
});
```

`client/src/features/insights/components/__tests__/priorityDistribution.test.tsx` 전체 교체:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PriorityDistribution from "../priorityDistribution";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 320 }),
}));

describe("PriorityDistribution", () => {
  it("제목과 우선순위별 개수·비율을 렌더링한다", () => {
    render(<PriorityDistribution distribution={{ low: 2, medium: 5, high: 3 }} title="이번 달 완료한 할 일의 우선순위 분포" />);

    expect(screen.getByText("이번 달 완료한 할 일의 우선순위 분포")).toBeInTheDocument();
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getByText("3 (30%)")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
    expect(screen.getByText("5 (50%)")).toBeInTheDocument();
    expect(screen.getByText("낮음")).toBeInTheDocument();
    expect(screen.getByText("2 (20%)")).toBeInTheDocument();
  });

  it("모두 0이어도 0으로 나누기 없이 렌더링된다", () => {
    render(<PriorityDistribution distribution={{ low: 0, medium: 0, high: 0 }} title="분포" />);

    expect(screen.getAllByText("0 (0%)")).toHaveLength(3);
  });
});
```

`client/src/features/insights/components/__tests__/streakCard.test.tsx`에 케이스 1개 추가(기존 케이스 유지):

```tsx
  it("전체 기간 기준임을 캡션으로 알린다", () => {
    render(<StreakCard streak={3} />);
    expect(screen.getByText("전체 기간 기준")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/insights/components`
Expected: FAIL — 새 props/문구 불일치

- [ ] **Step 3: client utils 삭제**

```bash
git rm -r client/src/features/insights/utils
```

- [ ] **Step 4: 훅 교체**

`client/src/features/insights/hooks/useProductivityMetrics.ts` 전체 교체:

```ts
import { useMemo } from "react";
import {
  bucketCompletions,
  computeCompletionRate,
  computeDueAdherence,
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeStatusBreakdown,
  computeStreak,
  listProjectOptions,
  resolvePeriodRange,
  resolveTrendGranularity,
  scopeTodosByProject,
  type InsightsFilter,
} from "@tododo/core";
import { useTodosForStats } from "./useTodosForStats";

/**
 * 필터(기간 프리셋 × 프로젝트)를 받아 모든 지표를 계산한다. Firestore 조회는
 * useTodosForStats가 전체 이력을 1회 가져오고, 필터링·계산은 여기 useMemo에서
 * core 순수 함수로 처리한다 — 필터를 바꿔도 네트워크 요청이 없다.
 * 스트릭만 필터와 무관하게 전체 기준이다(computeStreak 주석 참고).
 */
export const useProductivityMetrics = (filter: InsightsFilter) => {
  const { data: todos, isLoading, isError } = useTodosForStats();

  const metrics = useMemo(() => {
    const all = todos ?? [];
    const now = new Date();
    const range = resolvePeriodRange(filter.period, now);
    const granularity = resolveTrendGranularity(filter.period);
    const scoped = scopeTodosByProject(all, filter.projectId);

    return {
      completionRate: computeCompletionRate(scoped, range),
      dueAdherence: computeDueAdherence(scoped, range),
      recurringVsOneOff: computeRecurringVsOneOffRate(scoped, range),
      priorityDistribution: computePriorityDistribution(scoped, range),
      trend: bucketCompletions(scoped, range, granularity, now),
      streak: computeStreak(all, now),
      statusBreakdown: filter.projectId === null ? null : computeStatusBreakdown(scoped, filter.projectId),
      projects: listProjectOptions(all),
    };
  }, [todos, filter.period, filter.projectId]);

  return { ...metrics, isLoading, isError };
};
```

- [ ] **Step 5: 요약 카드 교체**

`client/src/features/insights/components/insightsSummaryCards.tsx` 전체 교체:

```tsx
import type { CompletionRateResult } from "@tododo/core";
import { Grid, Card, Label, Value, Sub } from "./insightsSummaryCards.styles";

interface InsightsSummaryCardsProps {
  /** "이번 달" 같은 기간 접두사. 카드 제목이 필터를 따라가게 한다. */
  periodLabel: string;
  completionRate: CompletionRateResult;
  dueAdherence: CompletionRateResult;
  recurringVsOneOff: { recurring: CompletionRateResult; oneOff: CompletionRateResult };
}

const toPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

const InsightsSummaryCards = ({ periodLabel, completionRate, dueAdherence, recurringVsOneOff }: InsightsSummaryCardsProps) => {
  const cards = [
    {
      label: `${periodLabel} 완료율`,
      value: toPercent(completionRate.rate),
      sub: `${completionRate.completed} / ${completionRate.total}`,
    },
    {
      label: "기한 준수율",
      value: toPercent(dueAdherence.rate),
      sub: `${dueAdherence.completed} / ${dueAdherence.total}`,
    },
    {
      label: "반복 할 일 완료율",
      value: toPercent(recurringVsOneOff.recurring.rate),
      sub: `${recurringVsOneOff.recurring.completed} / ${recurringVsOneOff.recurring.total}`,
    },
    {
      label: "일반 할 일 완료율",
      value: toPercent(recurringVsOneOff.oneOff.rate),
      sub: `${recurringVsOneOff.oneOff.completed} / ${recurringVsOneOff.oneOff.total}`,
    },
  ];

  return (
    <Grid>
      {cards.map((card) => (
        <Card key={card.label}>
          <Label>{card.label}</Label>
          <Value>{card.value}</Value>
          <Sub>{card.sub}</Sub>
        </Card>
      ))}
    </Grid>
  );
};

export default InsightsSummaryCards;
export type { InsightsSummaryCardsProps };
```

- [ ] **Step 6: 완료 추이 카드 교체**

`client/src/features/insights/components/completionTrend.tsx` 전체 교체:

```tsx
import { BarChart3 } from "lucide-react";
import type { TrendBucket } from "@tododo/core";
import { EmptyState, useElementWidth } from "@/shared";
import { BarChart } from "./charts";
import { Card, Title, ChartArea } from "./completionTrend.styles";

interface CompletionTrendProps {
  buckets: TrendBucket[];
  /** "이번 달 완료 추이"처럼 필터를 반영한 제목. */
  title: string;
}

const formatBarTitle = (label: string, value: number) => `${label}: ${value}건 완료`;

const CompletionTrend = ({ buckets, title }: CompletionTrendProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const points = buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }));
  const max = Math.max(0, ...points.map((p) => p.value));
  const isEmpty = buckets.length === 0 || max === 0;

  return (
    <Card>
      <Title>{title}</Title>
      {isEmpty ? (
        <EmptyState icon={BarChart3} title="이 기간에 기록이 없습니다" description="할 일을 완료하면 여기에 추이가 쌓입니다" />
      ) : (
        <ChartArea ref={ref}>
          <BarChart points={points} width={width} ariaLabel={`${title}, 최대 ${max}건`} formatTitle={formatBarTitle} />
        </ChartArea>
      )}
    </Card>
  );
};

export default CompletionTrend;
export type { CompletionTrendProps };
```

`client/src/features/insights/components/completionTrend.styles.tsx` 전체 교체(막대 styled 삭제):

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

/** SVG가 이 요소의 측정 너비를 따라간다. */
const ChartArea = styled.div`
  width: 100%;
  min-width: 0;
`;

export { Card, Title, ChartArea };
```

- [ ] **Step 7: 우선순위 분포 카드 교체**

`client/src/features/insights/components/priorityDistribution.tsx` 전체 교체:

```tsx
import type { PriorityDistribution as PriorityDistributionData } from "@tododo/core";
import { useElementWidth } from "@/shared";
import { HorizontalBars } from "./charts";
import { Card, Title, ChartArea } from "./priorityDistribution.styles";

interface PriorityDistributionProps {
  distribution: PriorityDistributionData;
  title: string;
}

const PriorityDistribution = ({ distribution, title }: PriorityDistributionProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const rows = [
    { label: "높음", value: distribution.high },
    { label: "보통", value: distribution.medium },
    { label: "낮음", value: distribution.low },
  ];

  return (
    <Card>
      <Title>{title}</Title>
      <ChartArea ref={ref}>
        <HorizontalBars rows={rows} width={width} ariaLabel={title} />
      </ChartArea>
    </Card>
  );
};

export default PriorityDistribution;
export type { PriorityDistributionProps };
```

`client/src/features/insights/components/priorityDistribution.styles.tsx` 전체 교체:

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const ChartArea = styled.div`
  width: 100%;
  min-width: 0;
`;

export { Card, Title, ChartArea };
```

- [ ] **Step 8: 스트릭 카드 캡션**

`client/src/features/insights/components/streakCard.tsx`의 `Content` 안에 캡션 추가:

```tsx
import { Flame } from "lucide-react";
import { Card, IconWrapper, Content, Value, Label, Caption } from "./streakCard.styles";

interface StreakCardProps {
  streak: number;
}

/** 스트릭은 기간/프로젝트 필터와 무관하게 항상 전체 기준이라 캡션으로 알린다. */
const StreakCard = ({ streak }: StreakCardProps) => {
  return (
    <Card>
      <IconWrapper>
        <Flame size={20} aria-hidden="true" />
      </IconWrapper>
      <Content>
        <Value>{streak}일</Value>
        <Label>{streak > 0 ? "연속 완료 중" : "오늘부터 시작해보세요"}</Label>
        <Caption>전체 기간 기준</Caption>
      </Content>
    </Card>
  );
};

export default StreakCard;
export type { StreakCardProps };
```

`client/src/features/insights/components/streakCard.styles.tsx` 끝에 추가하고 export에 포함:

```tsx
const Caption = styled.span`
  font-size: 11px;
  color: ${colors.text.tertiary};
`;

export { Card, IconWrapper, Content, Value, Label, Caption };
```

- [ ] **Step 9: 페이지를 새 계약으로 배선 (필터는 기본값 고정)**

`client/src/features/insights/pages/insightsPage.tsx` 전체 교체:

```tsx
import { AlertCircle } from "lucide-react";
import { DEFAULT_INSIGHTS_FILTER, PERIOD_TITLE_LABELS } from "@tododo/core";
import { useIsPremium, useUpgradeInterest, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
import { EmptyState } from "@/shared";
import InsightsSkeleton from "@/shared/ui/skeleton/insightsSkeleton";
import { useProductivityMetrics } from "../hooks";
import { InsightsSummaryCards, StreakCard, PriorityDistribution, CompletionTrend } from "../components";
import { PageContainer, InsightsBody, SecondaryGrid } from "./insightsPage.styles";

const InsightsPage = () => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const filter = DEFAULT_INSIGHTS_FILTER;
  const metrics = useProductivityMetrics(filter);
  const { submitInterest } = useUpgradeInterest("완료 통계/인사이트 기능");
  const periodLabel = PERIOD_TITLE_LABELS[filter.period];

  if (isEntitlementLoading) return <InsightsSkeleton />;

  const renderContent = () => {
    if (metrics.isLoading) return <InsightsSkeleton />;
    if (metrics.isError) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="통계를 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      );
    }
    return (
      <>
        <StreakCard streak={metrics.streak} />
        <InsightsSummaryCards
          periodLabel={periodLabel}
          completionRate={metrics.completionRate}
          dueAdherence={metrics.dueAdherence}
          recurringVsOneOff={metrics.recurringVsOneOff}
        />
        <SecondaryGrid>
          <PriorityDistribution distribution={metrics.priorityDistribution} title={`${periodLabel} 완료한 할 일의 우선순위 분포`} />
          <CompletionTrend buckets={metrics.trend} title={`${periodLabel} 완료 추이`} />
        </SecondaryGrid>
      </>
    );
  };

  return (
    <PageContainer>
      <InsightsBody>
        <PremiumGate
          isPremium={isPremium}
          fallback={
            <PremiumLockedNotice
              title="완료 통계는 프리미엄 기능입니다"
              description="완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다"
              ctaLabel="관심 있어요"
              onCtaClick={submitInterest}
            />
          }
        >
          {renderContent()}
        </PremiumGate>
      </InsightsBody>
    </PageContainer>
  );
};

export default InsightsPage;
```

- [ ] **Step 10: 페이지 테스트의 mock 데이터를 새 계약으로 수정**

`client/src/features/insights/pages/__tests__/insightsPage.test.tsx`에서:

(a) 파일 상단 mock에 추가:

```tsx
vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 320 }),
}));
```

(b) `baseMetrics`를 다음으로 교체:

```tsx
const baseMetrics = {
  completionRate: { completed: 1, total: 2, rate: 0.5 },
  streak: 1,
  priorityDistribution: { low: 0, medium: 1, high: 0 },
  recurringVsOneOff: {
    recurring: { completed: 0, total: 0, rate: 0 },
    oneOff: { completed: 1, total: 2, rate: 0.5 },
  },
  dueAdherence: { completed: 1, total: 1, rate: 1 },
  trend: [{ key: "2026-09-14", label: "9/14", count: 1 }],
  statusBreakdown: null,
  projects: [],
  isLoading: false,
  isError: false,
};
```

(c) 문구 교체: `"최근 7일 완료율"` → `"이번 달 완료율"` (3곳: 프리미엄 렌더링 / 비프리미엄 / isError 케이스). `"완료한 할 일의 우선순위 분포"` → `"이번 달 완료한 할 일의 우선순위 분포"`.

- [ ] **Step 11: lint + 타입체크 + insights 테스트**

Run: `cd client && npm run lint && npx tsc -b --noEmit && npx vitest run src/features/insights`
Expected: 전부 PASS. 타입 에러가 나면 대개 core `dist`가 오래된 것 — `cd packages/core && npm run build` 후 재시도.

- [ ] **Step 12: 커밋**

```bash
git add -A client/src/features/insights
git commit -m "refactor(insights): 지표 계산을 core로 전환하고 카드를 SVG 차트로 교체

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 필터 바 + 페이지 상태 + 상태 구성 카드

**Files:**
- Create: `client/src/features/insights/components/insightsFilterBar.tsx`
- Create: `client/src/features/insights/components/insightsFilterBar.styles.tsx`
- Create: `client/src/features/insights/components/statusBreakdownCard.tsx`
- Create: `client/src/features/insights/components/statusBreakdownCard.styles.tsx`
- Modify: `client/src/features/insights/components/index.ts`
- Modify: `client/src/features/insights/pages/insightsPage.tsx`
- Test: `client/src/features/insights/components/__tests__/insightsFilterBar.test.tsx`
- Test: `client/src/features/insights/components/__tests__/statusBreakdownCard.test.tsx`
- Test: `client/src/features/insights/pages/__tests__/insightsPage.test.tsx`

**Interfaces:**
- Consumes: `InsightsFilter`, `ProjectOption`, `StatusBreakdown`, `PERIOD_PRESETS`, `PERIOD_TAB_LABELS`, `PERIOD_TITLE_LABELS` (`@tododo/core`), `StackedBar` (Task 5), `useProductivityMetrics(filter)` (Task 6)
- Produces:
  - `<InsightsFilterBar filter projects onChange />`
  - `<StatusBreakdownCard breakdown />`

- [ ] **Step 1: 필터 바 실패 테스트**

`client/src/features/insights/components/__tests__/insightsFilterBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InsightsFilterBar from "../insightsFilterBar";

const projects = [
  { id: "p1", title: "이사 준비", isDone: false },
  { id: "p2", title: "여름 휴가", isDone: true },
];

describe("InsightsFilterBar", () => {
  it("기간 탭 4개를 그리고 현재 값을 aria-selected로 표시한다", () => {
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["이번 주", "이번 달", "최근 90일", "전체"]);
    expect(screen.getByRole("tab", { name: "이번 달" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "이번 주" })).toHaveAttribute("aria-selected", "false");
  });

  it("탭을 누르면 period만 바뀐 필터로 onChange한다", () => {
    const onChange = vi.fn();
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: "p1" }} projects={projects} onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "최근 90일" }));

    expect(onChange).toHaveBeenCalledWith({ period: "last90Days", projectId: "p1" });
  });

  it("프로젝트 select는 '전체 프로젝트' + 루트 목록이고 완료된 건 (완료) 표시", () => {
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "프로젝트" });
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["전체 프로젝트", "이사 준비", "여름 휴가 (완료)"]);
  });

  it("프로젝트를 고르면 projectId가, 전체를 고르면 null이 넘어간다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "p2" } });
    expect(onChange).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: "p2" });

    rerender(<InsightsFilterBar filter={{ period: "thisMonth", projectId: "p2" }} projects={projects} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: null });
  });
});
```

- [ ] **Step 2: 상태 구성 카드 실패 테스트**

`client/src/features/insights/components/__tests__/statusBreakdownCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBreakdownCard from "../statusBreakdownCard";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 300 }),
}));

describe("StatusBreakdownCard", () => {
  it("누적 막대와 상태별 범례(건수)를 그린다", () => {
    const { container } = render(<StatusBreakdownCard breakdown={{ todo: 1, doing: 2, done: 3 }} />);

    expect(screen.getByText("프로젝트 상태 구성")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /상태 구성/ })).toBeInTheDocument();
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("할 일 1")).toBeInTheDocument();
    expect(screen.getByText("진행 중 2")).toBeInTheDocument();
    expect(screen.getByText("완료 3")).toBeInTheDocument();
  });

  it("전부 0이면 막대 대신 안내 문구", () => {
    render(<StatusBreakdownCard breakdown={{ todo: 0, doing: 0, done: 0 }} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("하위 할 일이 없습니다")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/features/insights/components/__tests__/insightsFilterBar.test.tsx src/features/insights/components/__tests__/statusBreakdownCard.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 4: 필터 바 구현**

`client/src/features/insights/components/insightsFilterBar.styles.tsx`:

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

/** 좁은 화면에선 탭 줄과 select가 두 줄로 wrap된다. */
const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
`;

/* recurrence.styles.tsx의 TabList/TabButton 패턴을 그대로 따른다 — 필터 바는
   카드 밖 상단에 놓이므로 높이만 조금 낮게 잡는다. */
const TabList = styled.div`
  display: flex;
  flex: 1 1 280px;
  height: 36px;
  border-bottom: 1px solid ${colors.border.tertiary};
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.secondary)};
  border-bottom: 2px solid ${({ $active }) => ($active ? colors.brand.strong : "transparent")};
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: ${colors.brand.strong};
  }
`;

/* todoForm.styles.tsx의 Select와 같은 모양. */
const ProjectSelect = styled.select`
  flex: 0 1 220px;
  min-width: 160px;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${colors.brand.strong};
  }
`;

export { Bar, TabList, TabButton, ProjectSelect };
```

`client/src/features/insights/components/insightsFilterBar.tsx`:

```tsx
import { PERIOD_PRESETS, PERIOD_TAB_LABELS, type InsightsFilter, type ProjectOption } from "@tododo/core";
import { Bar, TabList, TabButton, ProjectSelect } from "./insightsFilterBar.styles";

interface InsightsFilterBarProps {
  filter: InsightsFilter;
  projects: ProjectOption[];
  onChange: (next: InsightsFilter) => void;
}

const ALL_PROJECTS_VALUE = "";

const InsightsFilterBar = ({ filter, projects, onChange }: InsightsFilterBarProps) => (
  <Bar>
    <TabList role="tablist" aria-label="기간">
      {PERIOD_PRESETS.map((period) => (
        <TabButton
          key={period}
          type="button"
          role="tab"
          aria-selected={filter.period === period}
          $active={filter.period === period}
          onClick={() => onChange({ ...filter, period })}
        >
          {PERIOD_TAB_LABELS[period]}
        </TabButton>
      ))}
    </TabList>
    <ProjectSelect
      aria-label="프로젝트"
      value={filter.projectId ?? ALL_PROJECTS_VALUE}
      onChange={(event) =>
        onChange({ ...filter, projectId: event.target.value === ALL_PROJECTS_VALUE ? null : event.target.value })
      }
    >
      <option value={ALL_PROJECTS_VALUE}>전체 프로젝트</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.isDone ? `${project.title} (완료)` : project.title}
        </option>
      ))}
    </ProjectSelect>
  </Bar>
);

export default InsightsFilterBar;
export type { InsightsFilterBarProps };
```

- [ ] **Step 5: 상태 구성 카드 구현**

`client/src/features/insights/components/statusBreakdownCard.styles.tsx`:

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const ChartArea = styled.div`
  width: 100%;
  min-width: 0;
`;

const Legend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const LegendItem = styled.li`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

const LegendDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $color }) => $color};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.tertiary};
`;

export { Card, Title, ChartArea, Legend, LegendItem, LegendDot, Hint };
```

`client/src/features/insights/components/statusBreakdownCard.tsx`:

```tsx
import type { StatusBreakdown } from "@tododo/core";
import { useElementWidth } from "@/shared";
import { statusColors, type Status } from "@/styles/statusColors";
import { StackedBar } from "./charts";
import { Card, Title, ChartArea, Legend, LegendItem, LegendDot, Hint } from "./statusBreakdownCard.styles";

interface StatusBreakdownCardProps {
  breakdown: StatusBreakdown;
}

const STATUS_ORDER: { key: Status; label: string }[] = [
  { key: "todo", label: "할 일" },
  { key: "doing", label: "진행 중" },
  { key: "done", label: "완료" },
];

const colorOf = (key: string) => statusColors[key as Status].main;

/** 선택한 프로젝트의 현재 상태 구성. 색만으로 구분하지 않도록 범례에 건수를 병기한다. */
const StatusBreakdownCard = ({ breakdown }: StatusBreakdownCardProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const segments = STATUS_ORDER.map(({ key, label }) => ({ key, label, value: breakdown[key] }));
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <Title>프로젝트 상태 구성</Title>
      {total === 0 ? (
        <Hint>하위 할 일이 없습니다</Hint>
      ) : (
        <>
          <ChartArea ref={ref}>
            <StackedBar segments={segments} colorOf={colorOf} width={width} ariaLabel={`프로젝트 상태 구성, 총 ${total}건`} />
          </ChartArea>
          <Legend>
            {segments.map((segment) => (
              <LegendItem key={segment.key}>
                <LegendDot $color={colorOf(segment.key)} aria-hidden="true" />
                {`${segment.label} ${segment.value}`}
              </LegendItem>
            ))}
          </Legend>
        </>
      )}
    </Card>
  );
};

export default StatusBreakdownCard;
export type { StatusBreakdownCardProps };
```

`client/src/features/insights/components/index.ts`에 추가:

```ts
export { default as InsightsFilterBar } from "./insightsFilterBar";
export { default as StatusBreakdownCard } from "./statusBreakdownCard";
```

- [ ] **Step 6: 컴포넌트 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/insights/components`
Expected: PASS

- [ ] **Step 7: 페이지 테스트에 필터 케이스 추가 (실패 상태)**

`client/src/features/insights/pages/__tests__/insightsPage.test.tsx`의 `describe` 안에 추가:

```tsx
  it("기간 탭을 바꾸면 카드 제목이 따라간다", () => {
    render(<InsightsPage />);

    expect(screen.getByText("이번 달 완료율")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "이번 주" }));

    expect(screen.getByText("이번 주 완료율")).toBeInTheDocument();
    expect(screen.getByText("이번 주 완료 추이")).toBeInTheDocument();
  });

  it("프로젝트를 고르면 훅에 projectId가 전달되고 상태 구성 카드가 나타난다", async () => {
    const { useProductivityMetrics } = await import("../../hooks");
    vi.mocked(useProductivityMetrics).mockImplementation(
      (filter) =>
        ({
          ...baseMetrics,
          projects: [{ id: "p1", title: "이사 준비", isDone: false }],
          statusBreakdown: filter.projectId === "p1" ? { todo: 1, doing: 1, done: 2 } : null,
        }) as never,
    );

    render(<InsightsPage />);
    expect(screen.queryByText("프로젝트 상태 구성")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "p1" } });

    expect(useProductivityMetrics).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: "p1" });
    expect(screen.getByText("프로젝트 상태 구성")).toBeInTheDocument();
  });

  it("선택한 프로젝트가 목록에서 사라지면 전체로 되돌린다", async () => {
    const { useProductivityMetrics } = await import("../../hooks");
    let projects = [{ id: "p1", title: "이사 준비", isDone: false }];
    vi.mocked(useProductivityMetrics).mockImplementation(() => ({ ...baseMetrics, projects }) as never);

    const { rerender } = render(<InsightsPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "p1" } });
    expect(useProductivityMetrics).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: "p1" });

    projects = [];
    rerender(<InsightsPage />);

    expect(useProductivityMetrics).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: null });
  });
```

- [ ] **Step 8: 페이지 배선 (필터 상태 + 리셋 + 상태 구성 카드)**

`client/src/features/insights/pages/insightsPage.tsx`에서 import와 컴포넌트 본문 상단, `renderContent`, 반환부를 아래처럼 바꾼다:

```tsx
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { DEFAULT_INSIGHTS_FILTER, PERIOD_TITLE_LABELS, type InsightsFilter } from "@tododo/core";
import { useIsPremium, useUpgradeInterest, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
import { EmptyState } from "@/shared";
import InsightsSkeleton from "@/shared/ui/skeleton/insightsSkeleton";
import { useProductivityMetrics } from "../hooks";
import {
  InsightsFilterBar,
  InsightsSummaryCards,
  StreakCard,
  PriorityDistribution,
  CompletionTrend,
  StatusBreakdownCard,
} from "../components";
import { PageContainer, InsightsBody, SecondaryGrid } from "./insightsPage.styles";

const InsightsPage = () => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const [filter, setFilter] = useState<InsightsFilter>(DEFAULT_INSIGHTS_FILTER);
  const metrics = useProductivityMetrics(filter);
  const { submitInterest } = useUpgradeInterest("완료 통계/인사이트 기능");
  const periodLabel = PERIOD_TITLE_LABELS[filter.period];

  // 선택한 프로젝트가 삭제되는 등 옵션에서 사라지면 전체로 되돌린다.
  const { projectId } = filter;
  const { projects } = metrics;
  useEffect(() => {
    if (projectId !== null && !projects.some((project) => project.id === projectId)) {
      setFilter((prev) => ({ ...prev, projectId: null }));
    }
  }, [projectId, projects]);

  if (isEntitlementLoading) return <InsightsSkeleton />;

  const renderContent = () => {
    if (metrics.isLoading) return <InsightsSkeleton />;
    if (metrics.isError) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="통계를 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      );
    }
    return (
      <>
        <InsightsFilterBar filter={filter} projects={metrics.projects} onChange={setFilter} />
        <StreakCard streak={metrics.streak} />
        <InsightsSummaryCards
          periodLabel={periodLabel}
          completionRate={metrics.completionRate}
          dueAdherence={metrics.dueAdherence}
          recurringVsOneOff={metrics.recurringVsOneOff}
        />
        {metrics.statusBreakdown && <StatusBreakdownCard breakdown={metrics.statusBreakdown} />}
        <SecondaryGrid>
          <PriorityDistribution distribution={metrics.priorityDistribution} title={`${periodLabel} 완료한 할 일의 우선순위 분포`} />
          <CompletionTrend buckets={metrics.trend} title={`${periodLabel} 완료 추이`} />
        </SecondaryGrid>
      </>
    );
  };

  return (
    <PageContainer>
      <InsightsBody>
        <PremiumGate
          isPremium={isPremium}
          fallback={
            <PremiumLockedNotice
              title="완료 통계는 프리미엄 기능입니다"
              description="완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다"
              ctaLabel="관심 있어요"
              onCtaClick={submitInterest}
            />
          }
        >
          {renderContent()}
        </PremiumGate>
      </InsightsBody>
    </PageContainer>
  );
};

export default InsightsPage;
```

주의: 페이지 테스트에서 `useProductivityMetrics`는 mock이라 `projects`가 매 렌더 새 배열이면 `useEffect`가 매번 돌지만 `projectId === null`이면 setState를 안 하므로 무한 루프는 없다. 실제 훅은 `useMemo`라 참조가 안정적이다.

- [ ] **Step 9: 페이지 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/insights`
Expected: PASS (페이지 8 케이스 포함)

- [ ] **Step 10: lint + 타입체크 + 전체 유닛 테스트**

Run: `cd client && npm run lint && npx tsc -b --noEmit && npm test`
Expected: 전부 PASS, 회귀 0건 (기존 669개 중 insights 것만 바뀜)

- [ ] **Step 11: 커밋**

```bash
git add client/src/features/insights
git commit -m "feat(insights): 기간 프리셋 × 프로젝트 필터 바와 프로젝트 상태 구성 카드 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 통합 검증 (빌드·번들·실제 화면)

**Files:** 코드 변경 없음(발견된 버그 수정만). 필요 시 `docs/superpowers/specs/2026-09-20-insights-period-project-filter-design.md` 갱신.

- [ ] **Step 1: 프로덕션 빌드 + 번들 예산**

Run: `cd client && VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 npm run build && npm run check:bundle`
Expected: 빌드 성공, 번들 예산 통과. 실패하면 SVG 렌더러가 초기 청크에 들어갔는지(`/insights` 라우트는 lazy여야 함) 확인.

- [ ] **Step 2: 음수 UTC 오프셋으로 core/클라이언트 테스트 재실행 (CI와 동일)**

Run: `cd packages/core && TZ=America/New_York npm test && cd ../../client && TZ=America/New_York npm test`
Expected: 전부 PASS. 실패하면 날짜 키 대신 ms 계산이 섞인 곳을 찾는다.

- [ ] **Step 3: 개발 서버로 실제 계정 확인**

Run: `cd client && npm run dev` 후 브라우저(Chrome 확장 또는 사용자에게 요청)로 `/insights` 진입(프리미엄 계정). 확인 항목:
  - 프리셋 4개를 순서대로 눌러 추이 막대 개수가 `이번 주 ≤ 7`, `이번 달 = 오늘 날짜`, `최근 90일 = 13`, `전체 = 첫 완료월~이번 달 개월 수`인지, x 라벨이 겹치지 않는지
  - 프로젝트 하나 선택 → 요약 숫자·분포·추이가 바뀌고 "프로젝트 상태 구성" 카드가 나타나는지, "전체 프로젝트"로 돌아가면 사라지는지
  - 브라우저 폭을 400px 근처로 줄여 필터 바가 두 줄로 wrap되고 SVG가 폭에 맞춰 다시 그려지는지
  - 기록 없는 기간/프로젝트에서 "이 기간에 기록이 없습니다" 표시
  - 화면 스크린샷을 찍어 사용자에게 보여준다

- [ ] **Step 4: 발견 사항 반영**

시각적 문제(라벨 겹침, 막대 두께, 색 대비)가 있으면 `packages/core/src/insights/chart/layoutBarChart.ts`의 `LABEL_WIDTH`/`BAR_GAP_RATIO`/`DEFAULT_BAR_CHART_PADDING` 또는 렌더러 상수를 조정하고, core를 건드렸다면 `npm run build` + `dist` 커밋을 잊지 않는다. 테스트가 상수에 의존하는 케이스(`d0, d3, d7`)는 상수 변경 시 함께 갱신한다.

- [ ] **Step 5: 최종 커밋 (변경이 있을 때만)**

```bash
git add -A packages/core client docs
git commit -m "fix(insights): 실화면 검증 반영

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 자체 검토 결과

- **스펙 커버리지**: 필터 모델/기본값(T1), 주 시작 일요일(T1), 프로젝트 스코프·옵션 정렬·리셋(T2, T7), 지표 이동·range 통일·스트릭 예외·상태 구성(T2), 버킷 규칙(T3, 스펙 1줄 갱신), 기하 3종·nice ticks·라벨 간격·width 0(T4), 렌더러·토큰·aria(T5), 카드 교체·제목 필터 반영·EmptyState·스트릭 캡션·요약 카드 재구성(T6), 필터 바·상태 구성 카드·페이지 상태(T7), dist 커밋(T4, Global), 번들·TZ·실화면(T8). 범위 밖 항목(툴팁 컴포넌트, 비교, 모바일)은 어떤 태스크에도 없음.
- **타입 일관성**: `TrendBucket { key, label, count }`(T3) ↔ `CompletionTrend.buckets`(T6) ↔ 페이지 mock(T6 Step 10). `ProjectOption { id, title, isDone }`(T2) ↔ 필터 바(T7). `StatusBreakdown { todo, doing, done }`(T2) ↔ `StatusBreakdownCard`(T7). `useElementWidth` 반환 `{ ref, width }`(T5) ↔ 카드 mock(T6/T7). `layoutBarChart` 반환에 `plotLeft/plotRight` 포함(T4) ↔ `BarChart` 사용(T5).

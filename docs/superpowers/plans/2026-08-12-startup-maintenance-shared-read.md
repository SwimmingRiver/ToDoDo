# 앱 진입 스윕 읽기 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 진입 시 발생하는 Firestore 전체 스캔 3회 + N+1 자식 조회를 공유 스냅샷 1회로 줄이고, 쓰기가 없을 때의 캐시 무효화 연쇄를 제거한다.

**Architecture:** 세 스윕(`sweepArchivedTodos`, `sweepOverdueRecurringTodos`, `extendIndefiniteRecurringSeries`)이 각자 안고 있던 읽기·판단·쓰기를 분리한다. 판단 로직은 Firestore를 모르는 순수 함수(planner)로 `utils/startupMaintenance.ts`에 내려보내고, `api/todoApi.ts`는 사용자 Todo 전체를 한 번 읽어 planner 3개에 넘긴 뒤 스윕별로 독립 커밋한다. 진입점은 `runStartupMaintenance` 하나로 합치되, 스윕별 `try/catch`로 현재의 독립 실패 동작을 보존한다.

**Tech Stack:** TypeScript, Firebase Firestore (v9 modular), TanStack Query v5, Vitest, React 19

## Global Constraints

- 모든 명령은 `client/` 디렉토리에서 실행한다.
- 파일명은 `camelCase.ts` / `camelCase.tsx`.
- 피처 구조 의존 방향: `api/` → `hooks/` → 컴포넌트. planner는 `utils/`에 두고 `api/`가 가져다 쓴다. **`utils/`는 `api/`를 import하지 않는다.**
- Firestore 쿼리는 항상 `userId`로 필터링한다.
- `writeBatch` 청크 상한은 기존 `SWEEP_BATCH_SIZE = 400`을 그대로 쓴다 (Firestore 상한 500에 여유를 둔 값).
- 테스트에 절대 날짜를 하드코딩하지 않는다. `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`으로 시스템 시간을 고정한다. CI가 UTC라 로컬에서만 통과하는 테스트가 나온 전례가 있다.
- 커밋 메시지 말미에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 를 붙인다.
- 작업 브랜치는 `perf/startup-maintenance-shared-read` (이미 생성됨, 스펙 커밋 `1e6024b` 포함).
- pre-commit 훅이 전체 유닛 테스트를 돌린다(약 40초). 커밋 실패는 곧 테스트 실패다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `client/src/features/todo/utils/startupMaintenance.ts` | **신규.** 계획 타입 3종 + planner 3개 + `buildExtensionCreates`. Firestore를 import하지 않는다 |
| `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts` | **신규.** planner 유닛 테스트. Firestore 모의 없음 |
| `client/src/features/todo/utils/recurrence.ts` | `buildRecurringInstanceId`를 여기로 이동(현재 `todoApi.ts` 내부 private) |
| `client/src/features/todo/api/todoApi.ts` | 공유 읽기 1회 + 커밋 헬퍼 + `runStartupMaintenance`. 기존 스윕 3개 제거 |
| `client/src/features/todo/api/__tests__/startupMaintenance.api.test.ts` | **신규.** 커밋·청크 분할·그룹 정합성·에러 격리. 기존 스윕 테스트 3개를 대체 |
| `client/src/features/todo/hooks/useTodo.ts` | mutation 3개 → `useRunStartupMaintenance` 1개, 조건부 무효화 |
| `client/src/App.tsx` | `.mutate()` 3번 → 1번, ref 3개 → 1개 |

**삭제되는 테스트 파일:** `api/__tests__/sweepArchivedTodos.test.ts`, `api/__tests__/sweepOverdueRecurringTodos.test.ts` — 두 파일 모두 `getDocs` **호출 순서**에 `mockResolvedValueOnce` 체인으로 결합돼 있어(예: `sweepArchivedTodos.test.ts:98-104`가 "1번째=루트, 2번째=자식"을 가정), 읽기가 1회로 합쳐지면 성립하지 않는다. 판단 케이스는 planner 유닛 테스트로, 커밋 동작은 신규 api 테스트로 이관한다.

---

### Task 1: 계획 타입과 `planArchivedSweep`

**Files:**
- Create: `client/src/features/todo/utils/startupMaintenance.ts`
- Test: `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`

**Interfaces:**
- Consumes: `Todo` from `../types/todo.type`
- Produces:
  - `type TodoFieldUpdate = { id: string; fields: Partial<Omit<Todo, "id">> }`
  - `type ArchiveGroup = { updates: TodoFieldUpdate[] }`
  - `planArchivedSweep(todos: Todo[], cutoffISO: string, now: string): ArchiveGroup[]`

**배경:** 현재 `todoApi.ts:287-347`은 Firestore 쿼리로 루트를 고르고(`parentId==null`, `status=="done"`, `archived==false`, `doneAt<cutoffISO`) 루트마다 자식을 **별도 쿼리**로 가져온다. 그 판단을 메모리로 옮긴다.

**의도적 동작 변화 (반드시 테스트할 것):** 기존 Firestore 조건 `where("archived", "==", false)`는 **`archived` 필드가 아예 없는 레거시 문서를 매칭하지 않는다**. 메모리 판정에서는 `todo.archived !== true`로 바꿔 필드 없는 문서도 대상에 포함한다. `todo.type.ts:34-36`이 명시한 "없으면 archived 아닌 것으로 취급한다"가 원래 의도이고, 이 문서들은 `getTodos()`(`where("archived","==",false)`)에서 이미 보이지 않으므로 `archived: true`를 세팅해도 사용자에게 보이는 변화는 없다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo.type";
import { planArchivedSweep } from "../startupMaintenance";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const CUTOFF = "2026-06-10T00:00:00.000Z";
const NOW = "2026-07-10T00:00:00.000Z";

describe("planArchivedSweep", () => {
  it("컷오프보다 오래된 done 루트를 그룹으로 만든다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });

    const groups = planArchivedSweep([root], CUTOFF, NOW);

    expect(groups).toEqual([
      { updates: [{ id: "root-1", fields: { archived: true, updatedAt: NOW } }] },
    ]);
  });

  it("루트와 그 자식을 같은 그룹에 담는다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const child = makeTodo({ id: "child-1", parentId: "root-1", status: "done" });
    const otherChild = makeTodo({ id: "child-2", parentId: "root-9", status: "done" });

    const groups = planArchivedSweep([root, child, otherChild], CUTOFF, NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].updates.map((u) => u.id)).toEqual(["root-1", "child-1"]);
  });

  it("컷오프보다 최근에 done된 루트는 제외한다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-20T00:00:00.000Z" });

    expect(planArchivedSweep([root], CUTOFF, NOW)).toEqual([]);
  });

  it("done이 아닌 루트, 자식 항목, 이미 archived인 루트는 제외한다", () => {
    const notDone = makeTodo({ id: "a", status: "doing", doneAt: "2026-06-01T00:00:00.000Z" });
    const isChild = makeTodo({
      id: "b", parentId: "root-x", status: "done", doneAt: "2026-06-01T00:00:00.000Z",
    });
    const already = makeTodo({
      id: "c", status: "done", doneAt: "2026-06-01T00:00:00.000Z", archived: true,
    });

    expect(planArchivedSweep([notDone, isChild, already], CUTOFF, NOW)).toEqual([]);
  });

  it("archived 필드가 아예 없는 레거시 문서도 대상에 포함한다", () => {
    const legacy = makeTodo({ id: "legacy-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    delete (legacy as Partial<Todo>).archived;

    const groups = planArchivedSweep([legacy], CUTOFF, NOW);

    expect(groups[0].updates[0].id).toBe("legacy-1");
  });

  it("doneAt이 없는 done 루트는 제외한다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: null });

    expect(planArchivedSweep([root], CUTOFF, NOW)).toEqual([]);
  });

  it("대상이 없으면 빈 배열을 반환한다", () => {
    expect(planArchivedSweep([makeTodo()], CUTOFF, NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: FAIL — `Failed to resolve import "../startupMaintenance"`

- [ ] **Step 3: 최소 구현을 작성한다**

`client/src/features/todo/utils/startupMaintenance.ts`:

```ts
import type { Todo } from "../types/todo.type";

/** 기존 문서의 일부 필드를 갱신하는 계획 항목. */
export type TodoFieldUpdate = { id: string; fields: Partial<Omit<Todo, "id">> };

/**
 * 루트 하나와 그 자식 전체. 배치가 쪼개지더라도 한 그룹은 반드시 같은 커밋에
 * 들어가야 한다 — 그룹을 쪼개면 한 프로젝트의 자식 일부만 archived되고 나머지는
 * 안 되는 상태가 생긴다. 이 제약을 주석이 아니라 타입으로 표현한다.
 */
export type ArchiveGroup = { updates: TodoFieldUpdate[] };

/**
 * done된 지 cutoffISO보다 오래된 루트 프로젝트와 그 자식에 archived를 세울 계획을 만든다.
 *
 * 이전에는 루트를 Firestore 쿼리로 고르고 자식을 루트마다 별도 쿼리(N+1)로 가져왔다.
 * 이제 전체 스냅샷 하나를 받아 parentId로 메모리에서 그룹핑하므로 추가 왕복이 없다.
 *
 * archived 판정에 `!== true`를 쓰는 이유: 이전 Firestore 조건
 * `where("archived", "==", false)`는 필드가 아예 없는 레거시 문서를 매칭하지 않았다.
 * todo.type.ts가 명시한 "없으면 archived 아닌 것으로 취급" 의미를 따르며, 이 문서들은
 * getTodos()에서 이미 보이지 않으므로 archived를 세워도 화면 변화가 없다.
 */
export const planArchivedSweep = (
  todos: Todo[],
  cutoffISO: string,
  now: string,
): ArchiveGroup[] => {
  const childrenByParentId = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (!todo.parentId) continue;
    const siblings = childrenByParentId.get(todo.parentId) ?? [];
    siblings.push(todo);
    childrenByParentId.set(todo.parentId, siblings);
  }

  const groups: ArchiveGroup[] = [];
  for (const todo of todos) {
    if (todo.parentId !== null) continue;
    if (todo.status !== "done") continue;
    if (todo.archived === true) continue;
    if (!todo.doneAt) continue;
    if (todo.doneAt >= cutoffISO) continue;

    const members = [todo, ...(childrenByParentId.get(todo.id) ?? [])];
    groups.push({
      updates: members.map((m) => ({ id: m.id, fields: { archived: true, updatedAt: now } })),
    });
  }

  return groups;
};
```

> `doneAt >= cutoffISO` 문자열 비교로 충분하다 — 두 값 모두 `toISOString()` 산출물이라 사전순과 시간순이 일치한다. 기존 Firestore 조건 `where("doneAt", "<", cutoffISO)`도 같은 문자열 비교였다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: PASS (7 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add client/src/features/todo/utils/startupMaintenance.ts \
        client/src/features/todo/utils/__tests__/startupMaintenance.test.ts
git commit -m "$(cat <<'EOF'
feat: planArchivedSweep 순수 함수 추가

루트+자식 그룹핑을 Firestore N+1 쿼리에서 메모리 판정으로 옮긴다.
archived 필드가 없는 레거시 문서도 대상에 포함하도록 판정을 바로잡았다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `planOverdueRecurringSweep`

**Files:**
- Modify: `client/src/features/todo/utils/startupMaintenance.ts`
- Test: `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`

**Interfaces:**
- Consumes: `TodoFieldUpdate` (Task 1)
- Produces: `planOverdueRecurringSweep(todos: Todo[], todayStart: Date, now: string): TodoFieldUpdate[]`

**배경:** `todoApi.ts:375-406`의 판정을 그대로 옮긴다. 원본은 `status == "todo"`를 Firestore 쿼리로 걸렀으므로, 메모리 판정에 그 조건을 **명시적으로 추가**해야 한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`startupMaintenance.test.ts` 하단에 추가한다. 상단 import에 `planOverdueRecurringSweep`을 더한다.

```ts
describe("planOverdueRecurringSweep", () => {
  const todayStart = new Date("2026-07-10T00:00:00.000Z");
  const NOW_ISO = "2026-07-10T00:00:00.000Z";

  const makeInstance = (overrides: Partial<Todo> = {}): Todo =>
    makeTodo({
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "indefinite" },
      dueAt: "2026-07-01T00:00:00.000Z",
      ...overrides,
    });

  it("dueAt이 오늘보다 이전인 미완료 반복 인스턴스를 대상으로 삼는다", () => {
    const overdue = makeInstance({ id: "inst-1" });

    expect(planOverdueRecurringSweep([overdue], todayStart, NOW_ISO)).toEqual([
      { id: "inst-1", fields: { overdueArchived: true, updatedAt: NOW_ISO } },
    ]);
  });

  it("오늘 마감인 인스턴스는 제외한다", () => {
    const today = makeInstance({ id: "inst-1", dueAt: "2026-07-10T09:00:00.000Z" });

    expect(planOverdueRecurringSweep([today], todayStart, NOW_ISO)).toEqual([]);
  });

  it("status가 todo가 아닌 인스턴스는 제외한다", () => {
    const done = makeInstance({ id: "inst-1", status: "done" });
    const doing = makeInstance({ id: "inst-2", status: "doing" });

    expect(planOverdueRecurringSweep([done, doing], todayStart, NOW_ISO)).toEqual([]);
  });

  it("반복이 아닌 할 일은 제외한다", () => {
    const plain = makeTodo({ id: "plain-1", dueAt: "2026-07-01T00:00:00.000Z" });

    expect(planOverdueRecurringSweep([plain], todayStart, NOW_ISO)).toEqual([]);
  });

  it("이미 overdueArchived인 인스턴스는 제외한다", () => {
    const already = makeInstance({ id: "inst-1", overdueArchived: true });

    expect(planOverdueRecurringSweep([already], todayStart, NOW_ISO)).toEqual([]);
  });

  it("overdueArchived 필드가 없는 문서는 대상에 포함한다", () => {
    const legacy = makeInstance({ id: "inst-1" });
    expect(legacy.overdueArchived).toBeUndefined();

    expect(planOverdueRecurringSweep([legacy], todayStart, NOW_ISO)).toHaveLength(1);
  });

  it("dueAt이 없는 인스턴스는 제외한다", () => {
    const noDue = makeInstance({ id: "inst-1", dueAt: null });

    expect(planOverdueRecurringSweep([noDue], todayStart, NOW_ISO)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: FAIL — `planOverdueRecurringSweep is not a function`

- [ ] **Step 3: 최소 구현을 작성한다**

`startupMaintenance.ts`에 추가한다:

```ts
/**
 * 지난 미완료(overdue) 반복 인스턴스에 overdueArchived를 세울 계획을 만든다.
 *
 * overdueArchived는 Firestore 등호 조건에 쓰지 않는다 — 기존 문서엔 필드가 아예 없을
 * 수 있어 `where("overdueArchived", "==", false)`가 그 문서들을 걸러버린다. 백필 없이도
 * 안전하도록 여기서 `!== true`로 판정한다.
 *
 * status 조건은 이전에 Firestore 쿼리(`where("status", "==", "todo")`)가 담당했으므로
 * 메모리 판정으로 옮기면서 명시적으로 다시 걸어야 한다.
 */
export const planOverdueRecurringSweep = (
  todos: Todo[],
  todayStart: Date,
  now: string,
): TodoFieldUpdate[] => {
  const todayStartTime = todayStart.getTime();

  return todos
    .filter((todo) => {
      if (todo.status !== "todo") return false;
      if (!todo.recurrenceId) return false;
      if (todo.overdueArchived === true) return false;
      if (!todo.dueAt) return false;
      const due = new Date(todo.dueAt);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < todayStartTime;
    })
    .map((todo) => ({
      id: todo.id,
      fields: { overdueArchived: true, updatedAt: now },
    }));
};
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: PASS (14 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add client/src/features/todo/utils/startupMaintenance.ts \
        client/src/features/todo/utils/__tests__/startupMaintenance.test.ts
git commit -m "$(cat <<'EOF'
feat: planOverdueRecurringSweep 순수 함수 추가

status 조건이 Firestore 쿼리에서 메모리 판정으로 넘어오므로 명시적으로 건다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `buildRecurringInstanceId` 이동 + `planIndefiniteExtension`

**Files:**
- Modify: `client/src/features/todo/utils/recurrence.ts` (`buildRecurringInstanceId` 추가)
- Modify: `client/src/features/todo/api/todoApi.ts:41-53` (private 정의 제거, import로 교체)
- Modify: `client/src/features/todo/utils/startupMaintenance.ts`
- Test: `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`

**Interfaces:**
- Consumes: `generateRecurringDueDates(baseDueAt: string, rule: RecurrenceRule, horizonEnd: Date): string[]`, `buildRecurringInstanceId(recurrenceId: string, dueAt: string): string`
- Produces:
  - `type SeriesExtension = { recurrenceId: string; template: Omit<Todo, "id">; dueDates: string[] }`
  - `type TodoCreate = { id: string; doc: Omit<Todo, "id"> }`
  - `planIndefiniteExtension(todos: Todo[], horizonEnd: Date): SeriesExtension[]`
  - `buildExtensionCreates(extensions: SeriesExtension[], startOrder: number, userId: string, now: string): TodoCreate[]`

**왜 두 단계로 나누는가:** 현재 코드(`todoApi.ts:829-830` 주석)는 `getNextRootOrder`를 **첫 쓰기가 필요해지는 시점에만** 지연 조회한다 — 대부분의 앱 진입에서 확장할 게 없으므로 불필요한 조회를 피하기 위해서다. `getNextRootOrder`는 Firestore 조회라 순수 함수에 넣을 수 없다. 그래서 `planIndefiniteExtension`이 "무엇을 만들지"만 계산하고, 결과가 비어있지 않을 때만 api 레이어가 order를 조회해 `buildExtensionCreates`로 문서를 완성한다.

`buildRecurringInstanceId`를 옮기는 이유: `buildExtensionCreates`가 결정론적 문서 ID를 만들어야 하는데, 현재 이 함수는 `todoApi.ts` 내부 private이다. 순수 함수이고 `toDateKeyFromISO`에만 의존하므로 `utils/recurrence.ts`가 제자리다. `createRecurringTodo`/`editRecurringSeries`도 계속 쓰므로 `todoApi.ts`는 import로 바꾼다.

- [ ] **Step 1: `buildRecurringInstanceId`를 옮긴다**

`client/src/features/todo/utils/recurrence.ts` 하단에 추가한다 (`todoApi.ts:41-53`의 주석과 본문을 그대로 옮긴다):

```ts
import { toDateKeyFromISO } from "@/shared/utils/date";

/**
 * 반복 인스턴스 문서 ID를 {recurrenceId}_{YYYY-MM-DD}로 결정론적으로 만든다(로컬 타임존
 * 기준 연-월-일 — 코드베이스 전반의 toDateString() 기반 "같은 날짜" 판정과 동일 기준).
 *
 * createRecurringTodo/editRecurringSeries/extendIndefiniteRecurringSeries는 서로 다른
 * 탭·기기에서 겹쳐 실행될 수 있는데(withRecurringSeriesLock은 탭 내부만 직렬화), 인스턴스를
 * 매번 새 자동생성 ID로 만들면 같은 recurrenceId·같은 날짜에 대해 두 문서가 동시에 생성될 수
 * 있다. ID 자체를 recurrenceId+날짜로 고정하면 Firestore 문서 ID의 유일성이 곧 "같은
 * 날짜엔 항상 같은 문서"를 보장하므로, 여러 곳에서 동시에 써도(batch.set은 없으면 생성,
 * 있으면 덮어쓰는 upsert) 마지막에 커밋된 내용으로 수렴할 뿐 중복 문서가 생기지 않는다.
 */
export const buildRecurringInstanceId = (recurrenceId: string, dueAt: string): string =>
  `${recurrenceId}_${toDateKeyFromISO(dueAt)}`;
```

`todoApi.ts`에서 41-53행의 주석+정의를 삭제하고, 16행의 import를 확장한다:

```ts
import {
  buildRecurringInstanceId,
  generateRecurringDueDates,
  getDefaultHorizonEnd,
} from "../utils/recurrence";
```

`toDateKeyFromISO` import(`todoApi.ts:14`)는 다른 사용처가 없으면 제거한다. 확인:

```bash
grep -n "toDateKeyFromISO" client/src/features/todo/api/todoApi.ts
```

- [ ] **Step 2: 이동이 회귀를 만들지 않았는지 확인한다**

```bash
npm run test -- recurring && npx tsc -b --noEmit
```

Expected: PASS — `recurringTodoApi.test.ts` 33개 통과, 타입 에러 없음

- [ ] **Step 3: 실패하는 테스트를 작성한다**

`startupMaintenance.test.ts` 하단에 추가한다. import에 `planIndefiniteExtension`, `buildExtensionCreates`를 더한다.

```ts
describe("planIndefiniteExtension", () => {
  const horizonEnd = new Date("2026-08-07T00:00:00.000Z");

  const makeSeriesInstance = (overrides: Partial<Todo> = {}): Todo =>
    makeTodo({
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "indefinite" },
      dueAt: "2026-07-10T00:00:00.000Z",
      ...overrides,
    });

  it("마지막 인스턴스 이후 호라이즌까지의 날짜를 계획한다", () => {
    const latest = makeSeriesInstance({ id: "inst-1" });

    const [extension] = planIndefiniteExtension([latest], horizonEnd);

    expect(extension.recurrenceId).toBe("series-1");
    expect(extension.dueDates.length).toBeGreaterThan(0);
    expect(new Date(extension.dueDates[0]).getTime()).toBeGreaterThan(
      new Date("2026-07-10T00:00:00.000Z").getTime(),
    );
    expect(extension.template.title).toBe(latest.title);
  });

  it("이미 호라이즌까지 채워진 시리즈는 제외한다", () => {
    const filled = makeSeriesInstance({ id: "inst-1", dueAt: "2026-08-20T00:00:00.000Z" });

    expect(planIndefiniteExtension([filled], horizonEnd)).toEqual([]);
  });

  it("untilDate 종료 시리즈는 대상이 아니다", () => {
    const until = makeSeriesInstance({
      id: "inst-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-12-31T00:00:00.000Z" },
    });

    expect(planIndefiniteExtension([until], horizonEnd)).toEqual([]);
  });

  it("반복이 아닌 할 일은 대상이 아니다", () => {
    expect(planIndefiniteExtension([makeTodo({ id: "plain-1" })], horizonEnd)).toEqual([]);
  });

  it("시리즈에 이미 존재하는 날짜는 계획에서 뺀다", () => {
    const first = makeSeriesInstance({ id: "inst-1", dueAt: "2026-07-10T00:00:00.000Z" });
    const second = makeSeriesInstance({ id: "inst-2", dueAt: "2026-07-11T00:00:00.000Z" });

    const [extension] = planIndefiniteExtension([first, second], horizonEnd);

    const dateKeys = extension.dueDates.map((iso) => new Date(iso).toDateString());
    expect(dateKeys).not.toContain(new Date("2026-07-11T00:00:00.000Z").toDateString());
  });

  it("여러 시리즈를 각각 계획한다", () => {
    const a = makeSeriesInstance({ id: "a-1", recurrenceId: "series-a" });
    const b = makeSeriesInstance({ id: "b-1", recurrenceId: "series-b" });

    const extensions = planIndefiniteExtension([a, b], horizonEnd);

    expect(extensions.map((e) => e.recurrenceId).sort()).toEqual(["series-a", "series-b"]);
  });
});

describe("buildExtensionCreates", () => {
  it("startOrder부터 순차적으로 order를 매긴다", () => {
    const extensions = [
      {
        recurrenceId: "series-1",
        template: { ...makeTodo({ id: "x" }), title: "반복 할 일" } as Omit<Todo, "id">,
        dueDates: ["2026-07-11T00:00:00.000Z", "2026-07-12T00:00:00.000Z"],
      },
    ];

    const creates = buildExtensionCreates(extensions, 5, "test-user-id", "2026-07-10T00:00:00.000Z");

    expect(creates.map((c) => c.doc.order)).toEqual([5, 6]);
  });

  it("문서 ID를 recurrenceId_날짜로 결정론적으로 만든다", () => {
    const extensions = [
      {
        recurrenceId: "series-1",
        template: makeTodo({ id: "x" }) as Omit<Todo, "id">,
        dueDates: ["2026-07-11T00:00:00.000Z"],
      },
    ];

    const [create] = buildExtensionCreates(extensions, 0, "test-user-id", "2026-07-10T00:00:00.000Z");

    expect(create.id).toBe(`series-1_${toDateKeyFromISO("2026-07-11T00:00:00.000Z")}`);
  });

  it("startAt을 각 인스턴스의 발생일로 덮어쓰고 status를 todo로 초기화한다", () => {
    const extensions = [
      {
        recurrenceId: "series-1",
        template: makeTodo({ id: "x", status: "done", doneAt: "2026-07-01T00:00:00.000Z" }) as Omit<Todo, "id">,
        dueDates: ["2026-07-11T00:00:00.000Z"],
      },
    ];

    const [create] = buildExtensionCreates(extensions, 0, "test-user-id", "2026-07-10T00:00:00.000Z");

    expect(create.doc.startAt).toBe("2026-07-11T00:00:00.000Z");
    expect(create.doc.dueAt).toBe("2026-07-11T00:00:00.000Z");
    expect(create.doc.status).toBe("todo");
    expect(create.doc.doneAt).toBeNull();
    expect(create.doc.parentId).toBeNull();
  });

  it("여러 시리즈에 걸쳐 order가 계속 증가한다", () => {
    const template = makeTodo({ id: "x" }) as Omit<Todo, "id">;
    const extensions = [
      { recurrenceId: "series-a", template, dueDates: ["2026-07-11T00:00:00.000Z"] },
      { recurrenceId: "series-b", template, dueDates: ["2026-07-11T00:00:00.000Z"] },
    ];

    const creates = buildExtensionCreates(extensions, 10, "test-user-id", "2026-07-10T00:00:00.000Z");

    expect(creates.map((c) => c.doc.order)).toEqual([10, 11]);
  });
});
```

테스트 파일 상단 import에 `toDateKeyFromISO`를 추가한다:

```ts
import { toDateKeyFromISO } from "@/shared/utils/date";
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: FAIL — `planIndefiniteExtension is not a function`

- [ ] **Step 5: 최소 구현을 작성한다**

`startupMaintenance.ts`에 추가한다 (상단 import 확장 포함):

```ts
import type { RecurrenceRule, Todo } from "../types/todo.type";
import { buildRecurringInstanceId, generateRecurringDueDates } from "./recurrence";

/** 신규 문서 생성 계획 항목. id는 결정론적으로 계산된 문서 ID다. */
export type TodoCreate = { id: string; doc: Omit<Todo, "id"> };

/** 한 반복 시리즈에 대해 "무엇을 언제 만들지"만 담은 계획. order는 아직 비어 있다. */
export type SeriesExtension = {
  recurrenceId: string;
  /** 가장 최근 인스턴스의 필드를 승계할 템플릿. */
  template: Omit<Todo, "id">;
  dueDates: string[];
};

/**
 * 무기한(indefinite) 반복 시리즈들을 호라이즌까지 이어서 채울 계획을 만든다.
 * 기존 인스턴스는 건드리지 않고 마지막 인스턴스 이후의 빈 구간만 채운다.
 *
 * order를 여기서 매기지 않는 이유: 다음 order는 Firestore 조회(getNextRootOrder)가
 * 필요한데, 대부분의 앱 진입에서는 확장할 것이 없어 그 조회 자체를 하지 말아야 한다.
 * 계획이 비어있지 않을 때만 api 레이어가 조회해 buildExtensionCreates로 넘긴다.
 */
export const planIndefiniteExtension = (
  todos: Todo[],
  horizonEnd: Date,
): SeriesExtension[] => {
  const seriesByRecurrenceId = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (!todo.recurrenceId || !todo.recurrence) continue;
    if (todo.recurrence.endType !== "indefinite") continue;
    if (!todo.dueAt) continue;
    const list = seriesByRecurrenceId.get(todo.recurrenceId) ?? [];
    list.push(todo);
    seriesByRecurrenceId.set(todo.recurrenceId, list);
  }

  const extensions: SeriesExtension[] = [];

  for (const [recurrenceId, instances] of seriesByRecurrenceId) {
    const latest = instances.reduce((a, b) =>
      new Date(a.dueAt as string).getTime() > new Date(b.dueAt as string).getTime() ? a : b,
    );
    const latestTime = new Date(latest.dueAt as string).getTime();
    if (latestTime >= horizonEnd.getTime()) continue; // 이미 새 호라이즌까지 채워져 있음

    const rule = latest.recurrence as RecurrenceRule;
    // 멀티탭 등에서 이미 존재하는 날짜를 다시 만들지 않도록 최소한의 존재 체크를 한다.
    const existingDateKeys = new Set(
      instances.map((t) => new Date(t.dueAt as string).toDateString()),
    );
    const dueDates = generateRecurringDueDates(latest.dueAt as string, rule, horizonEnd)
      .filter((iso) => new Date(iso).getTime() > latestTime)
      .filter((iso) => !existingDateKeys.has(new Date(iso).toDateString()));

    if (dueDates.length === 0) continue;

    const { id: _id, ...template } = latest;
    extensions.push({ recurrenceId, template, dueDates });
  }

  return extensions;
};

/**
 * 계획에 order를 채워 실제 생성할 문서로 만든다.
 *
 * order는 시리즈 경계를 넘어 계속 증가한다 — batch가 커밋되기 전에는 새 인스턴스가
 * Firestore에 반영되지 않으므로, 시리즈마다 order를 다시 조회하면 서로 다른 시리즈의
 * 인스턴스들이 중복된 order를 받는다.
 */
export const buildExtensionCreates = (
  extensions: SeriesExtension[],
  startOrder: number,
  userId: string,
  now: string,
): TodoCreate[] => {
  const creates: TodoCreate[] = [];
  let nextOrder = startOrder;

  for (const { recurrenceId, template, dueDates } of extensions) {
    for (const dueAt of dueDates) {
      creates.push({
        id: buildRecurringInstanceId(recurrenceId, dueAt),
        doc: {
          ...template,
          userId,
          // template(마지막 인스턴스 필드 승계)에 담긴 startAt은 그 인스턴스 자신의
          // 발생일 기준 값이라 새로 만드는 인스턴스에는 맞지 않으므로 매번 덮어쓴다.
          startAt: dueAt,
          dueAt,
          status: "todo",
          doneAt: null,
          parentId: null,
          recurrenceId,
          createdAt: now,
          updatedAt: now,
          order: nextOrder,
        },
      });
      nextOrder += 1;
    }
  }

  return creates;
};
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
npm run test -- startupMaintenance
```

Expected: PASS (24 tests)

- [ ] **Step 7: 커밋한다**

```bash
git add client/src/features/todo/utils/ client/src/features/todo/api/todoApi.ts
git commit -m "$(cat <<'EOF'
feat: planIndefiniteExtension/buildExtensionCreates 추가

buildRecurringInstanceId를 todoApi 내부 private에서 utils/recurrence로 옮겨
순수 계획 함수가 결정론적 문서 ID를 만들 수 있게 했다.

order 조회 지연 최적화를 보존하려고 계획(날짜)과 문서 생성(order 채우기)을
두 단계로 나눴다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `runStartupMaintenance` — 공유 읽기와 커밋

**Files:**
- Modify: `client/src/features/todo/api/todoApi.ts` (기존 스윕 3개 제거, 신규 함수 추가)
- Create: `client/src/features/todo/api/__tests__/startupMaintenance.api.test.ts`
- Delete: `client/src/features/todo/api/__tests__/sweepArchivedTodos.test.ts`
- Delete: `client/src/features/todo/api/__tests__/sweepOverdueRecurringTodos.test.ts`
- Modify: `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts` (`extendIndefiniteRecurringSeries` 호출 4곳)

**Interfaces:**
- Consumes: `planArchivedSweep`, `planOverdueRecurringSweep`, `planIndefiniteExtension`, `buildExtensionCreates`, `ArchiveGroup`, `TodoFieldUpdate`, `TodoCreate` (Task 1-3)
- Produces: `runStartupMaintenance(cutoffDays?: number, horizonEnd?: Date): Promise<number>` — 실제로 쓴 문서 수

**제거되는 export:** `sweepArchivedTodos`, `sweepOverdueRecurringTodos`, `extendIndefiniteRecurringSeries`, `extendIndefiniteRecurringSeriesImpl`. 세 함수는 `useTodo.ts`에서만 쓰이며(Task 5에서 교체) 스크립트 의존이 없다.

**동시성:** `runStartupMaintenance` **전체**를 `withRecurringSeriesLock`으로 감싼다. 읽기와 확장 쓰기 사이에 다른 두 스윕의 커밋이 끼어 간격이 길어지므로, 기존보다 오히려 락이 더 필요하다. 락은 제네릭 `<T>`(`todoApi.ts:66`)라 `number` 반환이 그대로 통과한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`client/src/features/todo/api/__tests__/startupMaintenance.api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Todo } from "../../types/todo.type";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-10T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-user-id" } },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const toDocSnapshot = (todos: Todo[]) =>
  ({
    docs: todos.map((t) => ({
      id: t.id,
      ref: { id: t.id },
      data: () => {
        const { id: _id, ...rest } = t;
        return rest;
      },
    })),
  }) as never;

const makeBatch = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

describe("runStartupMaintenance", () => {
  beforeEach(async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockReset();
    vi.mocked(writeBatch).mockReset();
    const firebase = await import("@/shared/lib/firebase");
    Object.assign(firebase.auth, { currentUser: { uid: "test-user-id" } });
  });

  it("쓸 것이 없으면 0을 반환하고 배치를 만들지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([makeTodo()]));

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(0);
    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
  });

  it("컬렉션을 한 번만 읽는다", async () => {
    const { getDocs } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([makeTodo()]));

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance();

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it("루트와 자식을 자식 조회 없이 함께 archived 처리한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const child = makeTodo({ id: "child-1", parentId: "root-1", status: "done" });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([root, child]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
    expect(written).toBe(2);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "root-1" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.update).toHaveBeenCalledWith(
      { id: "child-1" },
      expect.objectContaining({ archived: true }),
    );
  });

  it("지난 미완료 반복 인스턴스에 overdueArchived를 세운다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const overdue = makeTodo({
      id: "inst-1",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
      dueAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([overdue]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(1);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "inst-1" },
      expect.objectContaining({ overdueArchived: true }),
    );
  });

  it("한 스윕이 실패해도 나머지 스윕은 계속 진행한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const overdue = makeTodo({
      id: "inst-1",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
      dueAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([root, overdue]));

    const failingBatch = makeBatch();
    failingBatch.commit.mockRejectedValue(new Error("permission-denied"));
    const okBatch = makeBatch();
    vi.mocked(writeBatch)
      .mockReturnValueOnce(failingBatch as never) // archived 스윕 → 실패
      .mockReturnValue(okBatch as never); // overdue 스윕 → 성공

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(okBatch.update).toHaveBeenCalledWith(
      { id: "inst-1" },
      expect.objectContaining({ overdueArchived: true }),
    );
    expect(written).toBe(1); // 실패한 스윕은 0으로 집계
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("한 배치 상한을 넘는 overdue 대상은 나눠서 커밋한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const many = Array.from({ length: 401 }, (_, i) =>
      makeTodo({
        id: `inst-${i}`,
        recurrenceId: "series-1",
        recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
        dueAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot(many));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(401);
    expect(batch.commit).toHaveBeenCalledTimes(2); // 400 + 1
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm run test -- startupMaintenance.api
```

Expected: FAIL — `runStartupMaintenance is not a function`

- [ ] **Step 3: 기존 스윕 3개를 제거하고 신규 함수를 구현한다**

`todoApi.ts`에서 삭제한다:
- `sweepArchivedTodos` 전체 (`:272-347`, 앞 JSDoc 포함)
- `sweepOverdueRecurringTodos` 전체 (`:349-406`, JSDoc 포함)
- `extendIndefiniteRecurringSeries` + `extendIndefiniteRecurringSeriesImpl` 전체 (`:788-887`, JSDoc 포함)

`SWEEP_BATCH_SIZE` 상수(`:277`)는 남긴다. import를 추가한다:

```ts
import {
  buildExtensionCreates,
  planArchivedSweep,
  planIndefiniteExtension,
  planOverdueRecurringSweep,
  type ArchiveGroup,
  type TodoCreate,
  type TodoFieldUpdate,
} from "../utils/startupMaintenance";
```

같은 자리에 추가한다:

```ts
/** 사용자의 Todo 전체를 한 번 읽는다. archived 문서도 포함한다 — 반복 시리즈의 마지막
 *  인스턴스가 archived된 경우 그걸 빼고 계산하면 이미 지난 날짜를 다시 만들어낸다. */
const fetchAllUserTodos = async (userId: string): Promise<Todo[]> => {
  const snapshot = await getDocs(query(todosRef, where("userId", "==", userId)));
  return snapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));
};

/** 평평한 업데이트 목록을 SWEEP_BATCH_SIZE 단위로 나눠 커밋한다. */
const commitUpdates = async (updates: TodoFieldUpdate[]): Promise<number> => {
  for (let i = 0; i < updates.length; i += SWEEP_BATCH_SIZE) {
    const chunk = updates.slice(i, i + SWEEP_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, fields }) => {
      batch.update(doc(db, "todos", id), fields);
    });
    await batch.commit();
  }
  return updates.length;
};

/**
 * 그룹 경계에서만 배치를 나눠 커밋한다. 그룹 도중에 commit하면 한 프로젝트의 자식
 * 일부만 archived되고 나머지는 안 되는 상태가 생긴다. 한 루트가 SWEEP_BATCH_SIZE보다
 * 많은 자식을 갖는 극단적 케이스는 다루지 않는다(이 프로젝트 규모에서 사실상 없다).
 */
const commitArchiveGroups = async (groups: ArchiveGroup[]): Promise<number> => {
  let batch: ReturnType<typeof writeBatch> | null = null;
  let pendingWrites = 0;
  let totalWritten = 0;

  const commitPending = async () => {
    if (batch && pendingWrites > 0) await batch.commit();
    batch = null;
    pendingWrites = 0;
  };

  for (const group of groups) {
    if (pendingWrites > 0 && pendingWrites + group.updates.length > SWEEP_BATCH_SIZE) {
      await commitPending();
    }
    if (!batch) batch = writeBatch(db);
    group.updates.forEach(({ id, fields }) => {
      (batch as ReturnType<typeof writeBatch>).update(doc(db, "todos", id), fields);
    });
    pendingWrites += group.updates.length;
    totalWritten += group.updates.length;
  }

  await commitPending();
  return totalWritten;
};

const commitCreates = async (creates: TodoCreate[]): Promise<number> => {
  for (let i = 0; i < creates.length; i += SWEEP_BATCH_SIZE) {
    const chunk = creates.slice(i, i + SWEEP_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, doc: docData }) => {
      batch.set(doc(db, "todos", id), docData);
    });
    await batch.commit();
  }
  return creates.length;
};

/**
 * 개별 스윕을 격리 실행한다. 하나가 실패해도 나머지는 진행해야 한다 — 이전에는 세 스윕이
 * 독립 mutation이라 자연히 그랬고, 하나로 합치면서 그 동작을 잃지 않기 위해 명시적으로
 * 감싼다. 사용자 액션이 아닌 백그라운드 유지보수라 조용히 넘어가되(다음 접속 때 재시도),
 * 운영 중 문제(예: permission-denied)를 감지할 수 있도록 콘솔에는 남긴다.
 */
const runSweep = async (name: string, run: () => Promise<number>): Promise<number> => {
  try {
    return await run();
  } catch (error) {
    console.error(`앱 진입 유지보수 실패 (${name}):`, error);
    return 0;
  }
};

/**
 * 앱 진입 시 1회 실행되는 백그라운드 유지보수(App.tsx). 세 정책을 한 번의 읽기로 처리한다.
 *
 * 1. 30일 지난 완료 프로젝트를 archived 처리 (루트+자식 단위)
 * 2. 지난 미완료 반복 인스턴스를 overdueArchived 처리
 * 3. 무기한 반복 시리즈를 새 호라이즌까지 확장
 *
 * 반환값은 실제로 쓴 문서 수다. 호출부(useTodo)는 이 값이 0보다 클 때만 캐시를 무효화한다 —
 * 세 정책 모두 대부분의 실행에서 쓸 것이 없는데, 무조건 무효화하면 하는 일 없이 getTodos()
 * 전체 재조회를 유발한다.
 *
 * 전체를 withRecurringSeriesLock으로 감싼다. 확장(3)은 읽고 판단한 뒤 쓰는 사이에 사용자의
 * editRecurringSeries가 끼어들면 stale 스냅샷 기준으로 커밋되는데, 읽기를 공유하면서 그
 * 간격에 다른 두 스윕의 커밋까지 끼어 더 길어졌다.
 */
export const runStartupMaintenance = (
  cutoffDays: number = 30,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<number> =>
  withRecurringSeriesLock(() => runStartupMaintenanceImpl(cutoffDays, horizonEnd));

const runStartupMaintenanceImpl = async (
  cutoffDays: number,
  horizonEnd: Date,
): Promise<number> => {
  const userId = getUserId();
  const allTodos = await fetchAllUserTodos(userId);

  const now = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffISO = cutoff.toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let written = 0;

  written += await runSweep("archived", () =>
    commitArchiveGroups(planArchivedSweep(allTodos, cutoffISO, now)),
  );

  written += await runSweep("overdue", () =>
    commitUpdates(planOverdueRecurringSweep(allTodos, todayStart, now)),
  );

  written += await runSweep("extension", async () => {
    const extensions = planIndefiniteExtension(allTodos, horizonEnd);
    if (extensions.length === 0) return 0;
    // 생성할 것이 있을 때만 order를 조회한다 — 대부분의 앱 진입에서는 여기 도달하지 않는다.
    const startOrder = await getNextRootOrder(userId);
    return commitCreates(buildExtensionCreates(extensions, startOrder, userId, now));
  });

  return written;
};
```

- [ ] **Step 4: 기존 스윕 테스트 2개를 삭제한다**

```bash
git rm client/src/features/todo/api/__tests__/sweepArchivedTodos.test.ts \
       client/src/features/todo/api/__tests__/sweepOverdueRecurringTodos.test.ts
```

- [ ] **Step 5: `recurringTodoApi.test.ts`의 extend 호출을 교체한다**

`extendIndefiniteRecurringSeries(horizonEnd)`를 호출하는 4곳(`:996`, `:1039`, `:1072`, `:1101`)을 찾는다:

```bash
grep -n "extendIndefiniteRecurringSeries" client/src/features/todo/api/__tests__/recurringTodoApi.test.ts
```

각 호출을 `runStartupMaintenance(30, horizonEnd)`로 바꾸고 import도 함께 바꾼다. **주의:** 이 테스트들의 `getDocs` 모의가 "시리즈 조회 → getNextRootOrder 조회" 순서를 가정하고 있다면, 공유 읽기로 바뀌면서 첫 호출이 `fetchAllUserTodos`가 된다. 실패하는 테스트를 하나씩 읽고 모의 순서를 새 흐름에 맞춘다.

- [ ] **Step 6: 전체 테스트와 타입체크를 돌린다**

```bash
npm run test && npx tsc -b --noEmit && npm run lint
```

Expected: 신규 api 테스트 6개 통과. `useTodo.ts`가 아직 삭제된 함수를 import하므로 **타입 에러가 남는 것이 정상이다** — Task 5에서 해소한다. 그 외 에러는 없어야 한다.

- [ ] **Step 7: 커밋한다**

`useTodo.ts`가 아직 깨진 상태라 pre-commit 훅의 테스트가 실패한다. Task 5까지 마친 뒤 함께 커밋한다. 이 단계에서는 커밋하지 않고 Task 5로 진행한다.

---

### Task 5: 호출부 배선 — 조건부 무효화

**Files:**
- Modify: `client/src/features/todo/hooks/useTodo.ts:14-18, 209-248, 250-265`
- Modify: `client/src/App.tsx:18, 24-50`

**Interfaces:**
- Consumes: `runStartupMaintenance(cutoffDays?: number, horizonEnd?: Date): Promise<number>` (Task 4)
- Produces: `useTodo().useRunStartupMaintenance` — TanStack Query `UseMutationResult<number, Error, void>`

- [ ] **Step 1: `useTodo.ts`의 import를 교체한다**

`:14-18`에서 `extendIndefiniteRecurringSeries`, `sweepArchivedTodos`, `sweepOverdueRecurringTodos` 세 줄을 지우고 `runStartupMaintenance`를 넣는다.

- [ ] **Step 2: mutation 3개를 1개로 교체한다**

`:209-248`의 `useExtendIndefiniteRecurringSeries`, `useSweepArchivedTodos`, `useSweepOverdueRecurringTodos` 세 블록을 통째로 지우고 다음으로 대체한다:

```ts
  // 앱 진입 시 1회 호출하는 백그라운드 유지보수(App.tsx). 완료 프로젝트 아카이빙,
  // 지난 반복 인스턴스 아카이빙, 무기한 반복 시리즈 확장을 한 번의 읽기로 처리한다.
  // 사용자 액션이 아니라 유지보수 성격이라 사용자에게는 조용히 넘어가고(다음 접속 때
  // 다시 시도됨), 실패 자체를 아무도 모르면 운영 중 문제를 감지할 수 없으므로 최소한
  // 콘솔에는 남긴다.
  //
  // 무효화를 written > 0으로 거는 이유: 세 정책 모두 대부분의 실행에서 쓸 것이 없다.
  // 무조건 무효화하면 하는 일 없이 getTodos() 전체 재조회를 유발한다. 쓴 것이 없으면
  // 서버 데이터가 이 유지보수 때문에 바뀐 게 없으므로 캐시는 이미 최신이다.
  const useRunStartupMaintenance = useMutation({
    mutationFn: () => runStartupMaintenance(),
    onSuccess: (written) => {
      if (written > 0) {
        queryClient.invalidateQueries({ queryKey: ["todos"] });
      }
    },
    onError: (error) => {
      console.error("앱 진입 유지보수 실패:", error);
    },
  });
```

`:250-265`의 return 객체에서 세 이름을 지우고 `useRunStartupMaintenance`를 넣는다.

- [ ] **Step 3: `App.tsx`를 갱신한다**

`:24-50`을 다음으로 교체한다:

```tsx
  const { useRunStartupMaintenance } = useTodo();
  const hasRunMaintenanceRef = useRef(false);

  // 인증된 레이아웃(App) 마운트 시 1회. 세션 중 재마운트되어도 다시 실행되지 않도록
  // ref로 막는다(라우트 이동으로는 App이 재마운트되지 않지만 방어적으로 둔다).
  useEffect(() => {
    if (!hasRunMaintenanceRef.current) {
      hasRunMaintenanceRef.current = true;
      useRunStartupMaintenance.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: 전체 검증을 돌린다**

```bash
npm run test && npx tsc -b --noEmit && npm run lint && npm run build
```

Expected: 전체 PASS. 타입 에러 0. `useTodo.test.tsx`(33개)가 삭제된 mutation 이름을 참조한다면 새 이름으로 갱신한다:

```bash
grep -n "useSweepArchivedTodos\|useSweepOverdueRecurringTodos\|useExtendIndefiniteRecurringSeries" \
  client/src/features/todo/hooks/__tests__/useTodo.test.tsx
```

- [ ] **Step 5: 커밋한다**

```bash
git add client/src/features/todo/api/ client/src/features/todo/hooks/useTodo.ts client/src/App.tsx
git commit -m "$(cat <<'EOF'
perf: 앱 진입 스윕을 공유 읽기 1회로 통합하고 무효화를 조건부로 전환

세 스윕이 각자 컬렉션을 읽던 것을(전체 3회 + 자식 N+1) 공유 스냅샷 1회로
합치고, 판단 로직을 순수 함수로 분리했다.

무효화가 조건 없이 돌던 것을 written > 0일 때만으로 바꿨다. 세 정책 모두
대부분의 실행에서 쓸 것이 없는데 무조건 무효화가 getTodos() 전체 재조회를
최대 3회 유발하고 있었다.

스윕별 try/catch로 기존의 독립 실패 동작을 보존한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 최종 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 삭제된 심볼의 잔존 참조를 확인한다**

```bash
grep -rn "sweepArchivedTodos\|sweepOverdueRecurringTodos\|extendIndefiniteRecurringSeries" \
  client/src --include="*.ts" --include="*.tsx"
```

Expected: 결과 없음. `.spec.md` 문서 파일의 언급은 남아도 무방하다(설계 이력).

- [ ] **Step 2: 읽기 횟수가 실제로 줄었는지 확인한다**

Task 4의 "컬렉션을 한 번만 읽는다" 테스트가 이를 보장한다. 재확인:

```bash
npm run test -- startupMaintenance.api
```

Expected: PASS, 6개 전부.

- [ ] **Step 3: 전체 게이트를 통과시킨다**

```bash
npm run lint && npx tsc -b --noEmit && npm run test && npm run build
```

Expected: 전부 PASS. 유닛 테스트 총계가 이전 425개에서 planner 24개 + api 6개가 더해지고 삭제된 스윕 테스트 18개(`sweepArchivedTodos` 8 + `sweepOverdueRecurringTodos` 10)가 빠진 수준이어야 한다.

- [ ] **Step 4: E2E를 돌린다**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:e2e
```

Firestore 에뮬레이터가 JDK 21+를 요구하는데 이 머신의 기본 `java`는 17이라, 위 두 줄 없이 실행하면 원인을 알려주지 않는 `Process from config.webServer was not able to start. Exit code: 1`로만 죽는다.

Expected: 24개 전부 PASS. 로그인 이후 플로우(할 일 생성/완료, 칸반 드래그, 캘린더)가 앱 진입 유지보수 변경의 영향을 받지 않았음을 확인한다.

- [ ] **Step 5: PR을 연다**

```bash
git push -u origin perf/startup-maintenance-shared-read
gh pr create --title "perf: 앱 진입 스윕 읽기 공유 + 무효화 조건부화" --body "$(cat <<'EOF'
## 배경

앱 진입 한 번에 Firestore 컬렉션 전체 스캔이 3회 + 자식 N+1회 발생하고, 여기에
쓰기가 없어도 무조건 도는 캐시 무효화가 `getTodos()` 재조회를 최대 3회 더 유발하고
있었다. Firestore는 문서 읽기 건수로 과금한다.

## 변경

- 세 스윕이 각자 하던 읽기를 공유 스냅샷 1회로 통합
- 판단 로직을 `utils/startupMaintenance.ts`의 순수 함수 3개로 분리
- `sweepArchivedTodos`의 자식 조회 N+1 제거 (메모리 `parentId` 그룹핑)
- 무효화를 `written > 0`일 때만으로 전환
- mutation 3개 → `useRunStartupMaintenance` 1개, 스윕별 `try/catch`로 독립 실패 보존

## 읽기 횟수

| | 이전 | 이후 |
| --- | --- | --- |
| 정상 상태(쓸 것 없음) | 4 + N | 2 |
| 쓸 것 있음 | 4 + N + 최대 3 | 3 |

## 의도적 동작 변화

`planArchivedSweep`의 archived 판정이 `=== false`에서 `!== true`로 바뀌어, `archived`
필드가 아예 없는 레거시 문서도 대상에 포함된다. `todo.type.ts`가 명시한 "없으면 archived
아닌 것으로 취급" 의미를 따른 것이며, 이 문서들은 `getTodos()`에서 이미 보이지 않으므로
사용자에게 보이는 변화는 없다.

설계: `docs/superpowers/specs/2026-08-12-startup-maintenance-shared-read-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 절 | 담당 태스크 |
| --- | --- |
| 1. 설계 개요 (공유 읽기, planner 분리, 스윕별 커밋, mutation 통합) | Task 1-5 |
| 2. 모듈 구조 (타입 3종, planner 시그니처, `getNextRootOrder` 지연) | Task 1, 2, 3 |
| 3. 실행 흐름 (`runSweep` 격리, `commitExtension` 2단계) | Task 4 |
| 3. 동시성 (`withRecurringSeriesLock` 전체 감싸기) | Task 4 Step 3 |
| 4. 읽기 범위 (`userId`만, archived 포함) | Task 4 `fetchAllUserTodos` |
| 5. 호출부 변경 (조건부 무효화, App.tsx ref 1개) | Task 5 |
| 6. 테스트 전략 (planner 유닛, 기존 테스트 재작성, 시간 mock) | Task 1-4 |
| 7. 기대 효과 (읽기 1회 검증) | Task 4 "컬렉션을 한 번만 읽는다", Task 6 Step 2 |

누락 없음.

**2. 플레이스홀더 스캔**

Task 4 Step 5(`recurringTodoApi.test.ts` 모의 순서 조정)가 실제 코드 없이 "실패하는 테스트를 하나씩 읽고 맞춘다"로 남아 있다. 해당 테스트 4곳의 모의 설정이 각기 다르고 Task 3·4의 구현 결과에 따라 필요한 수정이 달라져, 계획 시점에 정확한 코드를 적으면 오히려 틀린 지시가 된다. 실행자가 `grep`으로 위치를 찾고 실패 메시지를 근거로 고치도록 명령어와 판단 기준을 남겼다.

**3. 타입 일관성**

- `TodoFieldUpdate` — Task 1 정의, Task 2·4에서 동일하게 사용 ✓
- `ArchiveGroup` — Task 1 정의, Task 4 `commitArchiveGroups` 인자 ✓
- `TodoCreate` — Task 3 정의, Task 4 `commitCreates` 인자 ✓
- `SeriesExtension` — Task 3 정의, `planIndefiniteExtension` 반환 = `buildExtensionCreates` 인자 ✓
- `runStartupMaintenance(cutoffDays?, horizonEnd?)` — Task 4 정의, Task 5 무인자 호출, Task 4 Step 5 `(30, horizonEnd)` 호출 ✓
- 커밋 헬퍼 이름이 스펙 3절과 일치: `commitArchiveGroups`, `commitUpdates` ✓ (스펙의 `commitExtension`은 Task 4에서 `runSweep("extension", ...)` 인라인으로 구현 — 별도 함수를 만들지 않는 편이 `getNextRootOrder` 지연 조회를 읽기 쉽게 표현한다)

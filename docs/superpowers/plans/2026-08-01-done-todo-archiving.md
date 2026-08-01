# done 할 일 아카이빙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `getTodos()`가 done 항목을 무한정 전량 불러오는 문제를, 30일 지난 완료 프로젝트를 `archived` 플래그로 기본 조회에서 제외하는 방식으로 해결한다.

**Architecture:** Todo 문서에 `archived?: boolean` 필드를 추가하고 `getTodos()`에 `where("archived", "==", false)` 필터를 건다. 앱 진입 시 1회 실행되는 `sweepArchivedTodos()`가 done된 지 30일 지난 **루트 프로젝트(및 그 자식 전체)**를 찾아 batch로 `archived: true`를 채운다(개별 항목의 doneAt이 아니라 루트 기준 — 형제 서브태스크 진행률 계산 보호). 기존 문서에는 `archived` 필드가 없으므로, 필터 배포 전 1회성 백필 마이그레이션 스크립트로 `archived: false`를 채워야 한다.

**Tech Stack:** React, TypeScript, Firebase Firestore(`firebase/firestore` v9 modular SDK), TanStack Query, Vitest. 마이그레이션 스크립트는 `firebase-admin` + `tsx`.

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-08-01-done-todo-archiving-design.md`
- 아카이빙 판단은 **루트의 `doneAt`** 기준(30일)이지 개별 항목의 `doneAt`이 아니다 — 형제 서브태스크가 있는 진행 중 프로젝트의 진행률 계산(`getProjectProgress`)이 깨지지 않아야 한다.
- 테스트에서 시스템 날짜를 절대값으로 하드코딩하지 말고 `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`으로 고정한다(이 프로젝트 기존 컨벤션, CI가 UTC라 타임존도 함께 고려).
- 모든 client 명령은 `client/` 디렉토리에서 실행한다(`npm run test`, `npm run lint`, `npm run build`).
- "완료 보관함" 조회 UI는 이번 스코프 밖 — 만들지 않는다.
- 삭제(하드 delete) 기능은 이번 스코프 밖 — 추가하지 않는다.
- `getTodoDetail`(단건 조회)에는 `archived` 필터를 추가하지 않는다 — 아카이빙된 항목의 직링크도 계속 열려야 한다. `createTodo`/`createChildTodo`/`getNextRootOrder`의 order 계산용 쿼리(`parentId == null`)에도 `archived` 필터를 추가하지 않는다(정확성에 영향 없음).

---

### Task 1: Todo 타입에 `archived` 필드 추가 + `getTodos()` 필터링

**Files:**
- Modify: `client/src/features/todo/types/todo.type.ts`
- Modify: `client/src/features/todo/api/todoApi.ts:93-100` (`getTodos`)
- Test: `client/src/features/todo/api/__tests__/todoApi.test.ts`

**Interfaces:**
- Produces: `Todo.archived?: boolean` — 이후 모든 태스크가 이 필드를 읽고 쓴다. **선택적(optional) 필드로 추가한다** — 필수로 만들면 이 프로젝트의 14개 테스트 파일에 흩어진 `makeTodo`류 팩토리를 전부 고쳐야 하는데, `archived`는 UI/비즈니스 로직 어디에서도 읽지 않고 오직 `getTodos()`의 쿼리 조건으로만 쓰이는 내부 최적화 필드이므로 그 churn은 불필요하다. `mapDocToTodo`도 이미 `{ id, ...data } as Todo`로 런타임 강제를 하지 않는다.
- Produces: `getTodos(): Promise<Todo[]>` — 시그니처는 기존과 동일(변경 없음), 반환 결과에서 `archived === true`인 문서만 빠진다.

- [ ] **Step 1: Todo 타입에 필드 추가**

`client/src/features/todo/types/todo.type.ts`의 `Todo` 인터페이스에 다음 필드를 `recurrenceId` 다음 줄에 추가한다:

```ts
  /** 기본 조회(getTodos)에서 제외할지 여부. true면 30일 지난 완료 프로젝트(루트+자식)로 간주.
   *  기존 문서엔 필드가 없을 수 있어 optional — 없으면 archived 아닌 것으로 취급한다. */
  archived?: boolean;
```

- [ ] **Step 2: 실패하는 테스트 작성**

`client/src/features/todo/api/__tests__/todoApi.test.ts`의 `describe('getTodos', ...)` 블록 안, 기존 첫 번째 `it` 다음에 추가:

```ts
    it('archived: true인 문서는 결과에서 제외해야 한다', async () => {
      const { getDocs, query, where } = await import('firebase/firestore')
      const { getTodos } = await import('../todoApi')

      const mockDocs = [
        { id: 'active-1', data: () => ({ ...makeTodo({ order: 0 }), id: undefined, archived: false }) },
        { id: 'archived-1', data: () => ({ ...makeTodo({ order: 1, status: 'done' }), id: undefined, archived: true }) },
      ]

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockDocs,
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)

      await getTodos()

      // getTodos는 archived 필터링을 클라이언트가 아니라 Firestore 쿼리 조건으로 위임한다
      // (where("archived","==",false)) — mock에서는 Firestore가 실제로 필터링하지 않으므로
      // "쿼리에 그 조건이 들어갔는지"를 검증한다.
      expect(where).toHaveBeenCalledWith('archived', '==', false)
    })
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run (in `client/`): `npm run test -- todoApi.test.ts`
Expected: FAIL — `where` was not called with `('archived', '==', false)`

- [ ] **Step 4: `getTodos()`에 필터 추가**

`client/src/features/todo/api/todoApi.ts:93-100`을 다음으로 교체:

```ts
export const getTodos = async () => {
  const userId = getUserId();
  const q = query(
    todosRef,
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => mapDocToTodo(doc.id, doc.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `npm run test -- todoApi.test.ts`
Expected: PASS (전체 `todoApi.test.ts` 스위트, 기존 테스트 포함 모두 통과)

- [ ] **Step 6: 커밋**

```bash
cd client
git add src/features/todo/types/todo.type.ts src/features/todo/api/todoApi.ts src/features/todo/api/__tests__/todoApi.test.ts
git commit -m "feat: Todo에 archived 필드 추가, getTodos()에서 archived 문서 제외"
```

---

### Task 2: 신규 문서 생성 4곳에 `archived: false` 채우기

**Files:**
- Modify: `client/src/features/todo/api/todoApi.ts` (`createTodo`, `createChildTodo`, `createRecurringTodoImpl`, `editRecurringSeriesImpl`)
- Test: `client/src/features/todo/api/__tests__/todoApi.test.ts`, `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Todo.archived?: boolean`
- Produces: 4개 생성 경로 모두 `addDoc`/`batch.set`에 넘기는 데이터에 `archived: false`가 포함됨 — Task 3(sweep)이 archived 여부로 대상을 가리므로, 새 문서가 이 필드 없이 생성되면 `getTodos()`의 `archived == false` 필터에 걸려 화면에 영원히 안 보이는 조용한 버그가 된다.

- [ ] **Step 1: `createTodo` 실패하는 테스트 작성**

`client/src/features/todo/api/__tests__/todoApi.test.ts` 파일에 `describe('createTodo', ...)` 블록을 `describe('getTodos', ...)` 다음에 추가:

```ts
  describe('createTodo', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
    })

    it('생성한 문서에 archived: false를 명시적으로 채워야 한다', async () => {
      const { getDocs, addDoc, query, where } = await import('firebase/firestore')
      const { createTodo } = await import('../todoApi')

      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [],
      } as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never)
      vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
      vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)
      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'new-1' } as Awaited<ReturnType<typeof addDoc>>)

      await createTodo(makeTodo({ title: '새 할일' }))

      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archived: false }),
      )
    })
  })
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm run test -- todoApi.test.ts`
Expected: FAIL — `addDoc`에 넘긴 객체에 `archived` 키가 없음

- [ ] **Step 3: `createTodo`에 `archived: false` 추가**

`client/src/features/todo/api/todoApi.ts:132-140`의 `addDoc` 호출을 수정:

```ts
  const docRef = await addDoc(todosRef, {
    ...todoData,
    userId,
    createdAt: now,
    updatedAt: now,
    parentId: null,
    status: "todo",
    order: maxOrder + 1,
    archived: false,
  });
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm run test -- todoApi.test.ts`
Expected: PASS

- [ ] **Step 5: `createChildTodo`에 동일하게 적용 + 테스트**

`todoApi.test.ts`에 테스트 추가:

```ts
  describe('createChildTodo', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      const firebase = await import('@/shared/lib/firebase')
      Object.assign(firebase.auth, { currentUser: { uid: 'test-user-id' } })
    })

    it('생성한 하위 할 일에 archived: false를 명시적으로 채워야 한다', async () => {
      const { addDoc, updateDoc } = await import('firebase/firestore')
      const { createChildTodo } = await import('../todoApi')

      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'child-1' } as Awaited<ReturnType<typeof addDoc>>)
      vi.mocked(updateDoc).mockResolvedValueOnce(undefined)

      await createChildTodo('parent-1', { title: '하위 할일' }, [])

      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archived: false }),
      )
    })
  })
```

`client/src/features/todo/api/todoApi.ts:332-342`의 `addDoc` 호출에 `archived: false,` 를 `recurrenceId: null,` 다음 줄에 추가.

Run: `npm run test -- todoApi.test.ts` → PASS 확인.

- [ ] **Step 6: `createRecurringTodoImpl` 실패하는 테스트 작성**

`client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`의 `describe('createRecurringTodo', ...)` 블록 안에 테스트 추가(기존 "생성할 dueDates 개수만큼..." 테스트 바로 다음):

```ts
  it('생성한 각 인스턴스에 archived: false를 명시적으로 채운다', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce(emptyDocsSnapshot);
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import('../todoApi');
    await createRecurringTodo(
      makeTodo({ recurrence: dailyRule, startAt: '2026-07-10T09:00:00' }),
      new Date('2026-07-13T00:00:00'),
    );

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ archived: false }),
    );
  });
```

- [ ] **Step 7: 테스트 실행해서 실패 확인**

Run: `npm run test -- recurringTodoApi.test.ts`
Expected: FAIL

- [ ] **Step 8: `createRecurringTodoImpl`에 `archived: false` 추가**

`client/src/features/todo/api/todoApi.ts:413-436`의 `instanceData` 객체에 `archived: false,`를 `parentId: null,` 다음 줄에 추가.

- [ ] **Step 9: 테스트 실행해서 통과 확인**

Run: `npm run test -- recurringTodoApi.test.ts`
Expected: PASS

- [ ] **Step 10: `editRecurringSeriesImpl` 재생성 경로에도 동일하게 테스트+구현**

`recurringTodoApi.test.ts`의 `describe('editRecurringSeries', ...)` 안, "미래 todo 인스턴스는 삭제 후 새 규칙으로 재생성한다" 테스트 다음에 추가:

```ts
  it('재생성한 인스턴스에 archived: false를 명시적으로 채운다', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore');
    vi.mocked(getDocs)
      .mockResolvedValueOnce(emptyDocsSnapshot) // 시리즈 조회 결과 없음 → 전부 재생성
      .mockResolvedValueOnce(emptyDocsSnapshot); // getNextRootOrder
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import('../todoApi');
    await editRecurringSeries(
      makeTodo({
        id: 'series-1',
        recurrenceId: 'rec-1',
        recurrence: dailyRule,
        startAt: '2026-07-10T09:00:00',
        dueAt: '2026-07-10T09:00:00',
      }),
      new Date('2026-07-13T00:00:00'),
    );

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ archived: false }),
    );
  });
```

`client/src/features/todo/api/todoApi.ts:590-608`의 `batch.set` 두 번째 인자 객체에 `archived: false,`를 `parentId: null,` 다음 줄에 추가.

Run: `npm run test -- recurringTodoApi.test.ts`
Expected: PASS

- [ ] **Step 11: 전체 테스트 스위트 실행**

Run: `npm run test`
Expected: 전체 PASS (기존 315개 + 이번 태스크에서 추가한 테스트)

- [ ] **Step 12: 커밋**

```bash
cd client
git add src/features/todo/api/todoApi.ts src/features/todo/api/__tests__/todoApi.test.ts src/features/todo/api/__tests__/recurringTodoApi.test.ts
git commit -m "feat: 신규 Todo 문서 생성 4곳에 archived: false 명시"
```

---

### Task 3: `sweepArchivedTodos()` 구현

**Files:**
- Modify: `client/src/features/todo/api/todoApi.ts`
- Test: `client/src/features/todo/api/__tests__/sweepArchivedTodos.test.ts` (신규)

**Interfaces:**
- Consumes: `todosRef`, `getUserId()`, `mapDocToTodo` (todoApi.ts 내부 기존 헬퍼)
- Produces: `sweepArchivedTodos(cutoffDays?: number): Promise<void>` — Task 4의 `useSweepArchivedTodos` 훅이 이 함수를 감싼다. 기본값 `cutoffDays = 30`.

- [ ] **Step 1: 신규 테스트 파일 작성 — 실패하는 테스트들**

`client/src/features/todo/api/__tests__/sweepArchivedTodos.test.ts` 신규 생성:

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
  db: {},
  auth: {
    currentUser: { uid: "test-user-id" },
  },
  googleProvider: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => ({})),
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

const toDocSnapshot = (todos: Todo[]) => ({
  docs: todos.map((t) => ({
    id: t.id,
    ref: { id: t.id },
    data: () => {
      const { id: _id, ...rest } = t;
      return rest;
    },
  })),
});

const emptyDocsSnapshot = { docs: [] };

const makeBatch = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

const resetFirestoreMocks = async () => {
  const { getDocs, writeBatch } = await import("firebase/firestore");
  vi.mocked(getDocs).mockReset();
  vi.mocked(writeBatch).mockReset();
};

describe("sweepArchivedTodos", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
    const firebase = await import("@/shared/lib/firebase");
    Object.assign(firebase.auth, { currentUser: { uid: "test-user-id" } });
  });

  it("자식 없는 단독 투두가 done된 지 30일 넘었으면 archived 처리한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({
      id: "solo-1",
      status: "done",
      doneAt: "2026-06-01T00:00:00.000Z", // 39일 전
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(toDocSnapshot([root])) // 루트 조회
      .mockResolvedValueOnce(emptyDocsSnapshot); // 자식 조회(없음)
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(batch.update).toHaveBeenCalledWith(
      { id: "solo-1" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("프로젝트(자식 있음) 전체가 done된 지 30일 넘었으면 루트+자식 전부 archived 처리한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({
      id: "project-1",
      status: "done",
      doneAt: "2026-06-01T00:00:00.000Z",
    });
    const child1 = makeTodo({ id: "child-1", parentId: "project-1", status: "done" });
    const child2 = makeTodo({ id: "child-2", parentId: "project-1", status: "done" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(toDocSnapshot([root]))
      .mockResolvedValueOnce(toDocSnapshot([child1, child2]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(batch.update).toHaveBeenCalledWith({ id: "project-1" }, expect.objectContaining({ archived: true }));
    expect(batch.update).toHaveBeenCalledWith({ id: "child-1" }, expect.objectContaining({ archived: true }));
    expect(batch.update).toHaveBeenCalledWith({ id: "child-2" }, expect.objectContaining({ archived: true }));
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("루트 조회 결과가 없으면(진행 중인 프로젝트뿐이면) batch를 만들지 않는다", async () => {
    // 형제 서브태스크 중 하나가 40일 전 done이어도, 나머지가 진행 중이라 루트 자체가
    // done이 아니면 Firestore 쿼리(status=="done") 조건에 애초에 걸리지 않는다 —
    // 즉 이 케이스는 루트 쿼리가 빈 결과를 반환하는 것으로 자연스럽게 표현된다.
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(emptyDocsSnapshot);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(writeBatch).not.toHaveBeenCalled();
  });

  it("기본 기준일(30일)로 cutoff를 계산해 doneAt 범위 쿼리에 사용한다", async () => {
    const { getDocs, where } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(emptyDocsSnapshot);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    // 2026-07-10 기준 30일 전 = 2026-06-10
    expect(where).toHaveBeenCalledWith("doneAt", "<", "2026-06-10T00:00:00.000Z");
  });

  it("cutoffDays 인자를 넘기면 그 기준으로 cutoff를 계산한다", async () => {
    const { getDocs, where } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(emptyDocsSnapshot);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos(90);

    // 2026-07-10 기준 90일 전 = 2026-04-11
    expect(where).toHaveBeenCalledWith("doneAt", "<", "2026-04-11T00:00:00.000Z");
  });

  it("인증되지 않은 경우 에러를 던져야 한다", async () => {
    const firebase = await import("@/shared/lib/firebase");
    Object.defineProperty(firebase.auth, "currentUser", { value: null, configurable: true });

    const { sweepArchivedTodos } = await import("../todoApi");
    await expect(sweepArchivedTodos()).rejects.toThrow("Not authenticated");

    Object.defineProperty(firebase.auth, "currentUser", {
      value: { uid: "test-user-id" },
      configurable: true,
    });
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm run test -- sweepArchivedTodos.test.ts`
Expected: FAIL — `sweepArchivedTodos`가 `todoApi.ts`에 없어 import 에러

- [ ] **Step 3: `sweepArchivedTodos` 구현**

`client/src/features/todo/api/todoApi.ts`에 `updateToDone` 함수(기존 253-262줄) 다음에 추가:

```ts
/**
 * 완료된 지 오래된 프로젝트를 기본 조회(getTodos)에서 제외되도록 archived 처리한다.
 * 앱 진입 시 1회 실행(App.tsx)되는 지연 스윕 — extendIndefiniteRecurringSeries와 같은 자리.
 *
 * 판단 기준은 개별 항목의 doneAt이 아니라 **루트(parentId===null)의 doneAt**이다.
 * 형제 서브태스크가 있는 프로젝트는 하나가 먼저 오래전에 done되고 나머지는 진행
 * 중일 수 있는데, 그 개별 항목만 먼저 archived되면 getProjectProgress가 참조하는
 * allTodos에서 조용히 빠져 진행률 계산이 틀어진다. calcParentStatus 불변식상 루트가
 * done이라는 것은 이미 모든 자식이 done이라는 뜻이므로, 루트가 done된 시점(=전체
 * 완료 시점)을 기준으로 루트+자식 전체를 한 번에 묶어 archived 처리한다.
 */
export const sweepArchivedTodos = async (cutoffDays: number = 30): Promise<void> => {
  const userId = getUserId();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffISO = cutoff.toISOString();

  const rootsSnapshot = await getDocs(
    query(
      todosRef,
      where("userId", "==", userId),
      where("parentId", "==", null),
      where("status", "==", "done"),
      where("archived", "==", false),
      where("doneAt", "<", cutoffISO),
    ),
  );

  if (rootsSnapshot.empty) return;

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  for (const rootDoc of rootsSnapshot.docs) {
    batch.update(rootDoc.ref, { archived: true, updatedAt: now });

    const childrenSnapshot = await getDocs(
      query(todosRef, where("userId", "==", userId), where("parentId", "==", rootDoc.id)),
    );
    childrenSnapshot.docs.forEach((childDoc) => {
      batch.update(childDoc.ref, { archived: true, updatedAt: now });
    });
  }

  await batch.commit();
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm run test -- sweepArchivedTodos.test.ts`
Expected: PASS (7개 테스트 전부)

- [ ] **Step 5: 전체 테스트 스위트 + lint 실행**

Run: `npm run test && npm run lint`
Expected: 전체 PASS, lint 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd client
git add src/features/todo/api/todoApi.ts src/features/todo/api/__tests__/sweepArchivedTodos.test.ts
git commit -m "feat: sweepArchivedTodos 구현 — 루트 단위로 30일 지난 완료 프로젝트 archived 처리"
```

---

### Task 4: `useSweepArchivedTodos` 훅 + App.tsx 연동

**Files:**
- Modify: `client/src/features/todo/hooks/useTodo.ts`
- Modify: `client/src/App.tsx`
- Test: `client/src/features/todo/hooks/__tests__/useTodo.test.tsx`

**Interfaces:**
- Consumes: Task 3의 `sweepArchivedTodos(cutoffDays?: number): Promise<void>`
- Produces: `useTodo().useSweepArchivedTodos` — `useMutation` 객체, `.mutate()` 호출 시 성공하면 `["todos"]` 쿼리 invalidate, 실패하면 콘솔에 에러 로그(사용자에게는 알리지 않음).

- [ ] **Step 1: 훅 mock에 `sweepArchivedTodos` 추가**

`client/src/features/todo/hooks/__tests__/useTodo.test.tsx:18-32`의 `vi.mock('../../api', ...)` 객체에 `sweepArchivedTodos: vi.fn(),`를 `extendIndefiniteRecurringSeries: vi.fn(),` 다음 줄에 추가. (이 mock은 실제 모듈을 부분적으로 대체하는 게 아니라 전체를 대체하는 객체 리터럴이므로, 새 export를 여기 추가하지 않으면 훅 코드가 `sweepArchivedTodos`를 import할 때 `undefined`가 되어 다음 단계 테스트가 실패한다.)

- [ ] **Step 2: 실패하는 테스트 작성**

`useTodo.test.tsx`의 `describe('useExtendIndefiniteRecurringSeries', ...)` 블록 다음(511줄 직전, `describe('useTodo 훅', ...)`가 닫히기 전)에 추가:

```ts
  describe('useSweepArchivedTodos', () => {
    it('done 아카이빙 스윕 mutation이 정의되어 있어야 한다', () => {
      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      expect(result.current.useSweepArchivedTodos).toBeDefined()
      expect(typeof result.current.useSweepArchivedTodos.mutate).toBe('function')
    })

    it('성공 시 todos 쿼리를 무효화해야 한다', async () => {
      const { getTodos, sweepArchivedTodos } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      vi.mocked(sweepArchivedTodos).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useSweepArchivedTodos.mutate()

      await waitFor(() => {
        expect(result.current.useSweepArchivedTodos.isSuccess).toBe(true)
      })

      expect(vi.mocked(sweepArchivedTodos)).toHaveBeenCalled()
    })

    it('실패 시 사용자에게는 알리지 않되 콘솔에는 에러를 남겨야 한다', async () => {
      const { getTodos, sweepArchivedTodos } = await import('../../api')

      vi.mocked(getTodos).mockResolvedValue([])
      const error = new Error('permission-denied')
      vi.mocked(sweepArchivedTodos).mockRejectedValueOnce(error)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useTodo(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.useGetTodos.isSuccess).toBe(true)
      })

      result.current.useSweepArchivedTodos.mutate()

      await waitFor(() => {
        expect(result.current.useSweepArchivedTodos.isError).toBe(true)
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('done 아카이빙 스윕 실패'),
        error,
      )

      consoleErrorSpy.mockRestore()
    })
  })
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `npm run test -- useTodo.test.tsx`
Expected: FAIL — `result.current.useSweepArchivedTodos`가 `undefined`

- [ ] **Step 4: `useTodo.ts`에 훅 추가**

`client/src/features/todo/hooks/useTodo.ts`의 import 목록(3-17줄)에 `sweepArchivedTodos,`를 `extendIndefiniteRecurringSeries,` 다음 줄에 추가하고, `useExtendIndefiniteRecurringSeries`(207-215줄) 다음에 새 훅을 추가:

```ts
  // 앱 진입 시 1회 호출해 30일 지난 완료 프로젝트를 archived 처리한다(App.tsx).
  // extendIndefiniteRecurringSeries와 동일한 이유로 사용자 액션이 아닌 백그라운드
  // 유지보수이므로 조용히 넘어가고, 실패는 콘솔에만 남긴다.
  const useSweepArchivedTodos = useMutation({
    mutationFn: () => sweepArchivedTodos(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: (error) => {
      console.error("done 아카이빙 스윕 실패:", error);
    },
  });
```

그리고 `return { ... }` 객체(217-230줄)에 `useSweepArchivedTodos,`를 `useExtendIndefiniteRecurringSeries,` 다음 줄에 추가.

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `npm run test -- useTodo.test.tsx`
Expected: PASS

- [ ] **Step 6: App.tsx에 연동**

`client/src/App.tsx`를 수정한다. 21줄:

```ts
  const { useExtendIndefiniteRecurringSeries, useSweepArchivedTodos } = useTodo();
```

22줄 다음(`hasExtendedRef` 다음)에 추가:

```ts
  const hasSweptRef = useRef(false);
```

27-32줄의 `useEffect` 안, `useExtendIndefiniteRecurringSeries.mutate();` 다음 줄에 추가:

```ts
    if (!hasSweptRef.current) {
      hasSweptRef.current = true;
      useSweepArchivedTodos.mutate();
    }
```

(두 유지보수 작업을 하나의 `useEffect`에 같이 둔다 — 둘 다 "앱 진입 시 1회, 실패해도 조용히" 성격이 동일하고 서로 의존하지 않는다.)

- [ ] **Step 7: 전체 테스트 + 빌드 확인**

Run: `npm run test && npm run build`
Expected: 전체 PASS, 빌드 에러 없음

- [ ] **Step 8: 커밋**

```bash
cd client
git add src/features/todo/hooks/useTodo.ts src/features/todo/hooks/__tests__/useTodo.test.tsx src/App.tsx
git commit -m "feat: 앱 진입 시 done 아카이빙 스윕 자동 실행"
```

---

### Task 5: 1회성 백필 마이그레이션 스크립트

**Files:**
- Create: `scripts/backfillArchivedField.ts`
- Modify: `package.json`(루트) — devDependency 및 실행 스크립트 추가

**Interfaces:**
- Consumes: 없음(독립 실행 스크립트, 앱 코드와 런타임 의존성 없음)
- Produces: 프로덕션 Firestore의 `todos` 컬렉션 전체 문서에 `archived` 필드가 없으면 `archived: false`를 채움. **이 스크립트는 Task 1의 `getTodos()` 필터를 프로덕션에 배포하기 전에 반드시 먼저 실행해야 한다** — 순서를 지키지 않으면 기존 데이터가 전부 화면에서 사라진다.

- [ ] **Step 1: 의존성 추가**

레포 루트(`/Users/river/tododo`)의 `package.json`에 devDependency 추가:

```bash
npm install --save-dev firebase-admin tsx
```

`package.json`의 `"scripts"`에 추가:

```json
    "backfill:archived": "tsx scripts/backfillArchivedField.ts"
```

- [ ] **Step 2: 스크립트 작성**

`scripts/backfillArchivedField.ts` 신규 생성:

```ts
/**
 * 1회성 마이그레이션: todos 컬렉션에서 archived 필드가 없는 문서에만 archived: false를 채운다.
 * 이미 필드가 있는 문서는 건드리지 않으므로 재실행해도 안전하다(멱등).
 *
 * 실행 전 GOOGLE_APPLICATION_CREDENTIALS 환경변수에 서비스 계정 키 파일 경로를 설정해야 한다.
 * (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:archived -- --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:archived
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const isDryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = 400; // Firestore batch 쓰기 상한(500) 아래 여유

const run = async () => {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db.collection("todos").get();
  const needsBackfill = snapshot.docs.filter((doc) => doc.data().archived === undefined);

  console.log(`전체 문서 ${snapshot.size}개 중 백필 대상 ${needsBackfill.length}개`);

  if (isDryRun) {
    console.log("--dry-run 모드: 실제 쓰기는 수행하지 않음");
    return;
  }

  if (needsBackfill.length === 0) {
    console.log("백필 대상 없음, 종료");
    return;
  }

  for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
    const chunk = needsBackfill.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.update(doc.ref, { archived: false });
    });
    await batch.commit();
    console.log(`${i + chunk.length}/${needsBackfill.length} 완료`);
  }

  console.log("백필 완료");
};

run().catch((error) => {
  console.error("백필 실패:", error);
  process.exit(1);
});
```

- [ ] **Step 3: Firestore 에뮬레이터로 검증**

이 스크립트는 Admin SDK로 실제 인프라를 직접 변경하는 1회성 운영 스크립트라, 이 프로젝트의 Vitest 유닛 테스트 스위트에 편입하지 않는다(스코프 밖 로직과 mock 인프라를 새로 만드는 비용 대비 실익이 낮음 — YAGNI). 대신 이 저장소에 이미 설정되어 있는 Firestore 에뮬레이터(`firebase.json`의 `emulators.firestore`, 포트 8080)로 실제에 가깝게 검증한다.

터미널 1:

```bash
firebase emulators:start --only firestore
```

터미널 2 — 에뮬레이터에 `archived` 필드 없는 더미 문서와 있는 더미 문서를 섞어 넣은 뒤 스크립트 실행:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export GOOGLE_APPLICATION_CREDENTIALS=  # 에뮬레이터는 인증 불필요, 빈 값으로 둔다
npm run backfill:archived -- --dry-run
```

Expected 출력: "백필 대상 N개" (N > 0이면 필드 없는 문서를 정상 탐지한 것)

```bash
npm run backfill:archived
```

Expected 출력: "백필 완료". 이후 다시 실행해도 "백필 대상 없음, 종료"가 떠야 한다(멱등성 확인).

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json scripts/backfillArchivedField.ts
git commit -m "chore: archived 필드 1회성 백필 마이그레이션 스크립트 추가"
```

---

## 배포 체크리스트 (코드 작업 완료 후, 사람이 직접 수행)

이 순서를 반드시 지킨다. 순서가 바뀌면 프로덕션의 기존 할 일이 전부 화면에서 사라지는 사고가 난다.

1. **Firestore 복합 인덱스 생성**: Task 3의 `sweepArchivedTodos` 쿼리(`userId`+`parentId`+`status`+`archived`+`doneAt` 범위)에 필요한 복합 인덱스를 Firebase 콘솔에서 미리 생성한다. (첫 실행 시 콘솔 에러 로그에 뜨는 생성 링크를 따라가도 된다.)
2. **프로덕션 백필 실행**: `GOOGLE_APPLICATION_CREDENTIALS`를 프로덕션 서비스 계정 키로 설정하고 `npm run backfill:archived -- --dry-run`으로 먼저 대상 수를 확인한 뒤, `npm run backfill:archived`로 실제 실행한다.
3. **백필 완료 확인 후에만** 이 브랜치를 `main`에 머지/배포한다(`main` push 시 Firebase Hosting 자동 배포되므로, 백필 전에 머지하면 안 된다).

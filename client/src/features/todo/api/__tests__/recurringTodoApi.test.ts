import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Todo, RecurrenceRule } from "../../types/todo.type";

// 이 파일의 fixture들은 2026-07 초중순을 기준으로 한 절대 날짜를 쓴다.
// 실제 시스템 시간으로 실행하면 그 날짜가 지날 때마다 호라이즌 계산이 깨지므로
// "오늘"을 fixture 범위 안의 고정 시점으로 못박아 시간 경과와 무관하게 만든다.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-10T00:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

// Firebase 모킹 - 실제 Firebase에 연결하지 않도록 처리
// currentUser를 테스트에서 null로 바꿔 "로그아웃" 상태를 흉내낼 수 있도록 가변 객체로 둔다.
// vi.mock 팩토리는 파일 맨 위로 끌어올려지므로 vi.hoisted로 함께 끌어올린다.
const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: { currentUser: { uid: "test-user-id" } } as {
    currentUser: { uid: string } | null;
  },
  mockDb: { __fake: "db" },
}));

vi.mock("@/shared/lib/firebase", () => ({
  auth: mockAuth,
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({
  db: mockDb,
}));

// 반복 시리즈 생성·수정·삭제의 Firestore 쓰기 기대값은 core(packages/core/src/recurring/
// __tests__/seriesApi.test.ts)가 검증한다. 웹은 db·uid를 주입해 위임만 하므로 그 세 함수만
// 가짜로 바꾸고, 나머지(calcParentStatus, withRecurringSeriesLock 등)는 실제 구현을 쓴다.
vi.mock("@tododo/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tododo/core")>();
  return {
    ...actual,
    createRecurringTodo: vi.fn(),
    editRecurringSeries: vi.fn(),
    deleteRecurringSeries: vi.fn(),
  };
});

let autoIdCounter = 0;

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  // doc(collectionRef) -> 자동 생성 id / doc(db, "todos", id) -> 지정된 id
  doc: vi.fn((...args: unknown[]) => {
    if (args.length <= 1) {
      autoIdCounter += 1;
      return { id: `auto-${autoIdCounter}` };
    }
    return { id: args[2] };
  }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

// `vi.clearAllMocks()`은 mock 호출 이력만 지울 뿐 `mockResolvedValueOnce` 등으로 쌓인
// "once" 큐는 비우지 않는다(vitest 동작). 이전 테스트에서 큐가 다 소비되지 않으면 다음
// 테스트로 leak되어 예기치 못한 반환값을 받게 되므로, getDocs/addDoc/writeBatch 등
// once 패턴을 쓰는 mock들은 매 테스트마다 완전히 mockReset()한다.
const resetFirestoreMocks = async () => {
  autoIdCounter = 0;
  const { getDocs, addDoc, updateDoc, deleteDoc, getDoc, writeBatch } = await import(
    "firebase/firestore"
  );
  vi.mocked(getDocs).mockReset();
  vi.mocked(addDoc).mockReset();
  vi.mocked(updateDoc).mockReset();
  vi.mocked(deleteDoc).mockReset();
  vi.mocked(getDoc).mockReset();
  vi.mocked(writeBatch).mockReset();
};

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
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const dailyRule: RecurrenceRule = { type: "daily", endType: "indefinite" };

const emptyDocsSnapshot: { docs: { id: string; data: () => Record<string, unknown> }[] } = {
  docs: [],
};

const makeBatch = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

describe("parentId ↔ recurrence 상호 배제 가드", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("createTodo: parentId와 recurrence가 함께 설정되면 에러를 던진다", async () => {
    const { createTodo } = await import("../todoApi");
    const todo = makeTodo({ parentId: "parent-1", recurrence: dailyRule });

    await expect(createTodo(todo)).rejects.toThrow();
  });

  it("editTodo: parentId와 recurrence가 함께 설정되면 에러를 던진다", async () => {
    const { editTodo } = await import("../todoApi");
    const todo = makeTodo({
      id: "todo-1",
      parentId: "parent-1",
      recurrence: dailyRule,
    });

    await expect(editTodo(todo, [todo])).rejects.toThrow();
  });

  it("createChildTodo: 전달된 recurrence를 무시하고 항상 null로 강제한다", async () => {
    const { getDocs, addDoc } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    vi.mocked(addDoc).mockResolvedValueOnce({ id: "child-1" } as Awaited<
      ReturnType<typeof addDoc>
    >);

    const { createChildTodo } = await import("../todoApi");

    await createChildTodo(
      "parent-1",
      { title: "하위 할 일", recurrence: dailyRule, recurrenceId: "leaked-series" },
      [],
    );

    expect(vi.mocked(addDoc)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recurrence: null, recurrenceId: null }),
    );
  });
});

describe("반복 시리즈 웹 래퍼 → core 위임", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
    mockAuth.currentUser = { uid: "test-user-id" };
    const core = await import("@tododo/core");
    vi.mocked(core.createRecurringTodo).mockReset();
    vi.mocked(core.editRecurringSeries).mockReset();
    vi.mocked(core.deleteRecurringSeries).mockReset();
  });

  afterEach(() => {
    mockAuth.currentUser = { uid: "test-user-id" };
  });

  it("createRecurringTodo: db와 현재 uid, horizonEnd를 core에 그대로 넘기고 결과를 반환한다", async () => {
    const core = await import("@tododo/core");
    const created = [makeTodo({ id: "series-1_2026-07-10" })];
    vi.mocked(core.createRecurringTodo).mockResolvedValueOnce(created);

    const { createRecurringTodo } = await import("../todoApi");
    const todo = makeTodo({ startAt: "2026-07-10T09:00:00", recurrence: dailyRule });
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const result = await createRecurringTodo(todo, horizonEnd);

    expect(core.createRecurringTodo).toHaveBeenCalledTimes(1);
    expect(core.createRecurringTodo).toHaveBeenCalledWith(mockDb, "test-user-id", todo, horizonEnd);
    expect(result).toBe(created);
  });

  it("editRecurringSeries: db와 현재 uid, horizonEnd를 core에 그대로 넘긴다", async () => {
    const core = await import("@tododo/core");
    vi.mocked(core.editRecurringSeries).mockResolvedValueOnce(undefined);

    const { editRecurringSeries } = await import("../todoApi");
    const seriesTodo = makeTodo({
      startAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-08-01T00:00:00");

    await editRecurringSeries(seriesTodo, horizonEnd);

    expect(core.editRecurringSeries).toHaveBeenCalledTimes(1);
    expect(core.editRecurringSeries).toHaveBeenCalledWith(
      mockDb,
      "test-user-id",
      seriesTodo,
      horizonEnd,
    );
  });

  it("deleteRecurringSeries: db와 현재 uid, recurrenceId를 core에 그대로 넘긴다", async () => {
    const core = await import("@tododo/core");
    vi.mocked(core.deleteRecurringSeries).mockResolvedValueOnce(undefined);

    const { deleteRecurringSeries } = await import("../todoApi");

    await deleteRecurringSeries("series-1");

    expect(core.deleteRecurringSeries).toHaveBeenCalledTimes(1);
    expect(core.deleteRecurringSeries).toHaveBeenCalledWith(mockDb, "test-user-id", "series-1");
  });

  it("horizonEnd를 생략하면 기본 호라이즌(getDefaultHorizonEnd)을 계산해 넘긴다", async () => {
    const core = await import("@tododo/core");
    vi.mocked(core.createRecurringTodo).mockResolvedValueOnce([]);
    vi.mocked(core.editRecurringSeries).mockResolvedValueOnce(undefined);

    const { createRecurringTodo, editRecurringSeries } = await import("../todoApi");
    const { getDefaultHorizonEnd } = await import("../../utils/recurrence");
    const expectedHorizon = getDefaultHorizonEnd();

    await createRecurringTodo(makeTodo({ startAt: "2026-07-10T09:00:00", recurrence: dailyRule }));
    await editRecurringSeries(
      makeTodo({ startAt: "2026-07-10T09:00:00", recurrenceId: "series-1", recurrence: dailyRule }),
    );

    expect(vi.mocked(core.createRecurringTodo).mock.calls[0][3]).toEqual(expectedHorizon);
    expect(vi.mocked(core.editRecurringSeries).mock.calls[0][3]).toEqual(expectedHorizon);
  });

  it("로그인되지 않았으면 세 함수 모두 \"Not authenticated\"로 거부하고 core를 호출하지 않는다", async () => {
    const core = await import("@tododo/core");
    mockAuth.currentUser = null;

    const { createRecurringTodo, editRecurringSeries, deleteRecurringSeries } = await import(
      "../todoApi"
    );

    await expect(
      createRecurringTodo(makeTodo({ startAt: "2026-07-10T09:00:00", recurrence: dailyRule })),
    ).rejects.toThrow("Not authenticated");
    await expect(
      editRecurringSeries(makeTodo({ recurrenceId: "series-1", recurrence: dailyRule })),
    ).rejects.toThrow("Not authenticated");
    await expect(deleteRecurringSeries("series-1")).rejects.toThrow("Not authenticated");

    expect(core.createRecurringTodo).not.toHaveBeenCalled();
    expect(core.editRecurringSeries).not.toHaveBeenCalled();
    expect(core.deleteRecurringSeries).not.toHaveBeenCalled();
  });
});

describe("runStartupMaintenance — 무기한 반복 시리즈 확장", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
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

  it("무기한 시리즈의 마지막 인스턴스 이후 빈 구간을 새 호라이즌까지 채운다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const latestExisting = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-15T00:00:00");

    // 확장 스윕은 order를 공유 스냅샷에서 메모리로 계산하므로 추가 조회가 없다.
    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, horizonEnd);

    // 7/13, 7/14, 7/15 (7/12는 이미 존재하므로 제외) = 3건 생성
    expect(batch.set).toHaveBeenCalledTimes(3);
    const createdDueDates = batch.set.mock.calls.map((call) => (call[1] as { dueAt: string }).dueAt);
    expect(createdDueDates.every((d) => new Date(d).getTime() > new Date(latestExisting.dueAt as string).getTime())).toBe(true);
    expect(batch.commit).toHaveBeenCalledTimes(1);

    // 생성된 인스턴스 문서 ID도 {recurrenceId}_{날짜} 형태로 결정론적이어야 한다.
    const setDocRefs = batch.set.mock.calls.map((call) => call[0] as { id: string });
    expect(setDocRefs.map((ref) => ref.id)).toEqual([
      "series-1_2026-07-13",
      "series-1_2026-07-14",
      "series-1_2026-07-15",
    ]);
  });

  it("확장 생성되는 인스턴스도 startAt이 latest 인스턴스의 고정값이 아니라 발생일(dueAt)로 갱신된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const latestExisting = makeTodo({
      id: "latest-1",
      status: "todo",
      startAt: "2026-07-12T09:00:00",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-15T00:00:00");

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, horizonEnd);

    const setCalls = batch.set.mock.calls as [unknown, { startAt: string; dueAt: string }][];
    expect(setCalls.length).toBeGreaterThan(0);
    setCalls.forEach(([, data]) => {
      expect(data.startAt).toBe(data.dueAt);
    });
  });

  it("editRecurringSeries와 동일한 recurrenceId+날짜에 대해 항상 같은 문서 ID를 계산한다 (멀티탭/멀티기기에서 동시에 실행돼도 같은 문서로 수렴)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const latestExisting = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-15T00:00:00");

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, horizonEnd);

    // editRecurringSeries 쪽 테스트("재생성되는 인스턴스 문서 ID도 ... 결정론적이다")와 별개로 실행되지만,
    // 같은 recurrenceId("series-1")·같은 날짜(2026-07-13)에 대해 항상 같은 문자열 ID를 계산하므로
    // 두 함수가 서로 다른 탭/기기에서 이 날짜에 대해 동시에 문서를 만들어도 하나의 문서로 수렴한다.
    const firstDocRef = batch.set.mock.calls[0][0] as { id: string };
    expect(firstDocRef.id).toBe("series-1_2026-07-13");
  });

  it("이미 새 호라이즌까지 채워져 있으면 아무것도 생성하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const latestExisting = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-08-01T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-15T00:00:00"); // latest보다 이전

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, horizonEnd);

    expect(batch.set).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    // getNextRootOrder용 추가 조회도 발생하지 않아야 한다
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it("종료 조건이 특정 날짜(untilDate)인 시리즈는 확장 대상에서 제외한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const untilDateInstance = makeTodo({
      id: "until-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-until",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-20" },
    });
    const horizonEnd = new Date("2026-08-01T00:00:00");

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([untilDateInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, horizonEnd);

    expect(batch.set).not.toHaveBeenCalled();
    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
  });

  it("반복 시리즈가 하나도 없으면 아무 조회/쓰기도 추가로 하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const plainTodo = makeTodo({ id: "plain-1", recurrence: null, recurrenceId: null });

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([plainTodo]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance(30, new Date("2026-08-01T00:00:00"));

    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
  });
});

describe("runStartupMaintenance와 반복 시리즈 쓰기 동시 실행", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  const toDocSnapshot = (todos: Todo[]) => ({
    docs: todos.map((t) => ({
      id: t.id,
      data: () => {
        const { id: _id, ...rest } = t;
        return rest;
      },
    })),
  });

  // 버그 재현: App 마운트 시 runStartupMaintenance(확장 스윕 포함)가 백그라운드로 실행되는 동안
  // 사용자가 반복 시리즈를 수정(editRecurringSeries)하면, 두 함수가 각자 읽은(stale) 스냅샷을
  // 기준으로 독립적으로 batch를 커밋해 같은 recurrenceId/날짜에 문서가 중복 생성될 수 있다.
  // 이를 막으려면 두 함수(및 시리즈를 쓰는 다른 함수들)가 서로 겹쳐 실행되지 않고 순서대로
  // (직렬로) 실행되어야 한다. 생성·수정·삭제는 이제 core 함수 안에서 core의
  // withRecurringSeriesLock을 잡으므로, runStartupMaintenance도 바로 그 잠금(같은 모듈
  // 인스턴스)을 잡는지 확인한다. core 쪽 생성·수정·삭제 간 직렬화는 core seriesApi.test.ts가 검증한다.
  it("extend 실행 중 core 잠금을 거치는 시리즈 쓰기(editRecurringSeries 등)는 extend가 완전히 끝난 뒤에 실행된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const { withRecurringSeriesLock } = await import("@tododo/core");
    const horizonEnd = new Date("2026-07-15T00:00:00");

    const indefiniteInstance = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-07-11T09:00:00",
      recurrenceId: "series-extend",
      recurrence: dailyRule,
    });

    let resolveExtendRead: (value: unknown) => void = () => {};
    const extendReadPromise = new Promise((resolve) => {
      resolveExtendRead = resolve;
    });

    vi.mocked(getDocs)
      // extend의 전체 조회 - 의도적으로 지연시켜 "느린 네트워크"를 흉내낸다
      .mockImplementationOnce(() => extendReadPromise as ReturnType<typeof getDocs>);

    const extendBatch = makeBatch();
    vi.mocked(writeBatch).mockReturnValueOnce(
      extendBatch as unknown as ReturnType<typeof writeBatch>,
    );

    const { runStartupMaintenance } = await import("../todoApi");

    const extendPromise = runStartupMaintenance(30, horizonEnd);

    // core의 editRecurringSeries가 잡는 것과 같은 잠금으로 들어가는 시리즈 쓰기를 흉내낸다.
    const seriesWrite = vi.fn(async () => {
      // 이 시점엔 extend가 이미 커밋을 끝냈어야 한다.
      expect(extendBatch.commit).toHaveBeenCalledTimes(1);
    });
    const editPromise = withRecurringSeriesLock(seriesWrite);

    // extend의 첫 조회가 아직 끝나지 않은 시점 - 시리즈 쓰기가 새치기하면 안 된다
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(getDocs).mock.calls.length).toBe(1);
    expect(seriesWrite).not.toHaveBeenCalled();

    resolveExtendRead(
      toDocSnapshot([indefiniteInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    await extendPromise;
    expect(extendBatch.commit).toHaveBeenCalledTimes(1);

    await editPromise;
    expect(seriesWrite).toHaveBeenCalledTimes(1);
  });
});

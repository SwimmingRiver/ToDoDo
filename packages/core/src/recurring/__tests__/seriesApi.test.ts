import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Firestore } from "firebase/firestore";
import type { Todo, RecurrenceRule } from "../../types/todo";

// 웹 client/src/features/todo/api/__tests__/recurringTodoApi.test.ts에 있던 Firestore 쓰기
// 기대값 테스트를 core 시그니처(db, userId 주입)로 옮긴 것이다. 기대값은 그대로 둔다 —
// 웹 쪽에는 래퍼 위임 검증만 남는다.

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

const fakeDb = {} as Firestore;
// 웹에서 auth.currentUser.uid로 주입되던 값과 동일하게 둔다(기대값 보존).
const UID = "test-user-id";

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

describe("createRecurringTodo", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("생성할 dueDates 개수만큼 Todo 문서를 batch 생성하고 동일한 recurrenceId를 부여한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const created = await createRecurringTodo(fakeDb, UID, todo, horizonEnd);

    expect(created).toHaveLength(4); // 7/10, 11, 12, 13
    const recurrenceIds = new Set(created.map((t) => t.recurrenceId));
    expect(recurrenceIds.size).toBe(1);
    expect(batch.set).toHaveBeenCalledTimes(4);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    created.forEach((t) => {
      expect(t.status).toBe("todo");
    });
  });

  it("생성한 각 인스턴스에 archived: false를 명시적으로 채운다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");
    await createRecurringTodo(
      fakeDb,
      UID,
      makeTodo({ recurrence: dailyRule, startAt: "2026-07-10T09:00:00" }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ archived: false }),
    );
  });

  it("생성한 인스턴스 문서 ID는 {recurrenceId}_{날짜} 형태로 결정론적이다 (멀티탭/멀티기기 동시 생성 시 중복 방지)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const created = await createRecurringTodo(fakeDb, UID, todo, horizonEnd);

    // recurrenceId는 createRecurringTodoImpl 내부에서 doc(todosRef).id로 딱 한 번 생성되므로
    // 테스트 환경(autoIdCounter)에서는 "auto-1"로 고정된다.
    expect(created.map((t) => t.id)).toEqual([
      "auto-1_2026-07-10",
      "auto-1_2026-07-11",
      "auto-1_2026-07-12",
    ]);
  });

  it("recurrence가 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../seriesApi");
    const todo = makeTodo({ startAt: "2026-07-10T09:00:00", recurrence: null });

    await expect(createRecurringTodo(fakeDb, UID, todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
  });

  it("startAt이 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../seriesApi");
    const todo = makeTodo({ startAt: null, recurrence: dailyRule });

    await expect(createRecurringTodo(fakeDb, UID, todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
  });

  it("각 인스턴스의 startAt은 원본 startAt 고정값이 아니라 발생일(dueAt)로 갱신된다 (calendar.tsx 다중일 span 회귀 방지)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const created = await createRecurringTodo(fakeDb, UID, todo, horizonEnd);

    // startAt이 모든 인스턴스에 "2026-07-10T09:00:00"으로 고정 복제되면, 마지막 인스턴스는
    // startAt=7/10, dueAt=7/13이 되어 calendar.tsx가 4일짜리 span 이벤트로 잘못 그린다.
    // 각 인스턴스는 자기 자신의 발생일을 startAt으로 가져야 한다(dueAt과 동일한 날짜+시각).
    created.forEach((t) => {
      expect(t.startAt).toBe(t.dueAt);
    });
  });

  it("dueAt이 없어도(무기한 반복) 정상적으로 생성된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      dueAt: null,
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const created = await createRecurringTodo(fakeDb, UID, todo, horizonEnd);

    expect(created.length).toBeGreaterThan(0);
  });

  it("reminderOffsetMinutes를 모든 인스턴스에 승계한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");
    await createRecurringTodo(
      fakeDb,
      UID,
      makeTodo({ recurrence: dailyRule, startAt: "2026-07-10T09:00:00", reminderOffsetMinutes: 60 }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    for (const [, data] of batch.set.mock.calls) {
      expect(data).toMatchObject({ reminderOffsetMinutes: 60 });
    }
  });
});

describe("editRecurringSeries", () => {
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

  it("done 인스턴스는 삭제하지 않고 필드도 건드리지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const doneInstance = makeTodo({
      id: "done-1",
      status: "done",
      dueAt: "2026-07-01T09:00:00",
      title: "옛날 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([doneInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      // 반복이 유지되므로(recurrence non-null) 재생성용 order 조회가 한 번 더 발생한다
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "done-1",
      status: "done",
      startAt: "2026-07-01T09:00:00",
      dueAt: "2026-07-01T09:00:00",
      title: "새 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date("2026-08-01T00:00:00"));

    expect(batch.delete).not.toHaveBeenCalled();
  });

  it("doing 인스턴스는 삭제하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const doingInstance = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: "2026-07-05T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([doingInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      // 반복이 유지되므로(recurrence non-null) 재생성용 order 조회가 한 번 더 발생한다
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      startAt: "2026-07-05T09:00:00",
      dueAt: "2026-07-05T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date("2026-08-01T00:00:00"));

    expect(batch.delete).not.toHaveBeenCalled();
  });

  it("지난 미완료(overdue) todo 인스턴스는 삭제하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const pastIso = "2020-01-01T09:00:00"; // 확실히 과거
    const overdueInstance = makeTodo({
      id: "overdue-1",
      status: "todo",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([overdueInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      // 반복이 유지되므로(recurrence non-null) 재생성용 order 조회가 한 번 더 발생한다
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      startAt: pastIso,
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date("2026-08-01T00:00:00"));

    expect(batch.delete).not.toHaveBeenCalled();
  });

  it("overdue 인스턴스 자신을 수정하면 삭제/재생성이 아니라 그 문서를 직접 갱신해 수정 내용이 반영된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const pastIso = "2020-01-01T09:00:00";
    const overdueInstance = makeTodo({
      id: "overdue-1",
      status: "todo",
      description: "원래 설명",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([overdueInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      description: "수정된 설명",
      startAt: pastIso,
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date("2026-08-01T00:00:00"));

    expect(batch.delete).not.toHaveBeenCalled();
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: "수정된 설명" }),
    );
  });

  it("미래 todo 인스턴스는 삭제 후 새 규칙으로 재생성한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const futureIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const futureInstance = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: futureIso,
      dueAt: futureIso,
      title: "바뀐 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, horizonEnd);

    expect(batch.delete).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("재생성한 인스턴스에 archived: false를 명시적으로 채운다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      ) // 시리즈 조회 결과 없음 → 전부 재생성
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      ); // getNextRootOrder
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");
    await editRecurringSeries(
      fakeDb,
      UID,
      makeTodo({
        id: "series-1",
        recurrenceId: "rec-1",
        recurrence: dailyRule,
        startAt: "2026-07-10T09:00:00",
        dueAt: "2026-07-10T09:00:00",
      }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ archived: false }),
    );
  });

  it("재생성되는 인스턴스 문서 ID도 {recurrenceId}_{날짜} 형태로 결정론적이다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const futureIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const futureInstance = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: futureIso,
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3));

    const setCall = batch.set.mock.calls[0] as [{ id: string }, { dueAt: string }];
    const [docRef] = setCall;
    // toDateString()과 동일하게 로컬 타임존 기준 연-월-일로 키를 계산한다(구현과 동일한 방식으로 기대값 산출).
    const d = new Date(futureIso);
    const expectedDateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(docRef.id).toBe(`series-1_${expectedDateKey}`);
  });

  it("재생성되는 인스턴스도 startAt이 원본 고정값이 아니라 발생일(dueAt)로 갱신된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const futureIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const futureInstance = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: futureIso,
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, horizonEnd);

    const setCalls = batch.set.mock.calls as [unknown, { startAt: string; dueAt: string }][];
    expect(setCalls.length).toBeGreaterThan(0);
    setCalls.forEach(([, data]) => {
      expect(data.startAt).toBe(data.dueAt);
    });
  });

  it("반복 OFF 전환(recurrence: null) 시 미래 todo 인스턴스만 삭제하고 재생성하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const futureIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const pastIso = "2020-01-01T09:00:00";

    const futureInstance = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const overdueInstance = makeTodo({
      id: "overdue-1",
      status: "todo",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const doneInstance = makeTodo({
      id: "done-1",
      status: "done",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([futureInstance, overdueInstance, doneInstance]) as ReturnType<
        typeof getDocs
      > extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: null, // 반복 OFF
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30));

    // 미래 인스턴스 1개만 삭제, done/overdue는 보존
    expect(batch.delete).toHaveBeenCalledTimes(1);
    // OFF 전환이므로 재생성 없음 (getDocs가 재생성용 order 조회를 위해 2번째로 호출되지 않음)
    expect(batch.set).not.toHaveBeenCalled();
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it("recurrenceId가 없으면 에러를 던진다", async () => {
    const { editRecurringSeries } = await import("../seriesApi");
    const todo = makeTodo({ recurrenceId: null });

    await expect(editRecurringSeries(fakeDb, UID, todo, new Date())).rejects.toThrow();
  });

  it("doing 인스턴스 자체를 수정해도 같은 날짜에 새 todo 인스턴스를 중복 생성하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const todayIso = now.toISOString();
    const todayDateStr = todayIso.split("T")[0];

    // 시리즈에는 오늘 날짜의 doing 인스턴스 하나만 존재한다(예: 사용자가 진행 중으로 표시).
    const doingInstance = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([doingInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 사용자가 그 doing 인스턴스 자체를 열어 제목만 바꾸고 저장 (dueAt/recurrence는 그대로).
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      startAt: todayIso,
      dueAt: todayIso,
      title: "수정된 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, horizonEnd);

    // doing 인스턴스는 삭제되지 않아야 하고
    expect(batch.delete).not.toHaveBeenCalled();

    // 재생성 과정에서 이미 doing 인스턴스가 점유한 오늘 날짜에 새 todo 인스턴스가
    // 또 생성되면 캘린더/목록에 같은 날짜가 두 건으로 표시된다 — 이는 발생하면 안 된다.
    const createdDueDates = batch.set.mock.calls.map(
      (call) => (call[1] as { dueAt: string }).dueAt,
    );
    const duplicatesForToday = createdDueDates.filter((d) => d.startsWith(todayDateStr));
    expect(duplicatesForToday).toHaveLength(0);
  });

  it("doing 인스턴스 자신을 수정하면 삭제/재생성이 아니라 그 문서를 직접 갱신해 수정 내용이 반영된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const todayIso = now.toISOString();

    const doingInstance = makeTodo({
      id: "doing-1",
      status: "doing",
      description: "원래 설명",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([doingInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 사용자가 doing 인스턴스를 열어 설명만 바꾸고 저장 (status/dueAt/recurrence는 그대로).
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      description: "수정된 설명",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, horizonEnd);

    // 보존 정책 때문에 삭제되면 안 되고
    expect(batch.delete).not.toHaveBeenCalled();
    // 수정 내용은 그 문서에 직접 반영되어야 한다 — 지금은 아무 곳에도 반영되지 않아 실패한다.
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: "수정된 설명" }),
    );
  });

  it("보존된 인스턴스를 직접 갱신할 때도 userId는 클라이언트 입력이 아니라 getUserId()로 재계산한 값을 쓴다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const todayIso = now.toISOString();

    const doingInstance = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([doingInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 다른 사용자의 userId를 흉내내 보내더라도 반영되면 안 된다.
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      userId: "다른-사용자-id",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(fakeDb, UID, seriesTodo, horizonEnd);

    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "test-user-id" }),
    );
  });

  it("보존된 인스턴스의 마감일을 다른 보존된 인스턴스가 이미 점유한 날짜로 바꾸면 에러를 던진다(중복 재현 방지)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const now = new Date();
    const todayIso = now.toISOString();
    const pastIso = "2020-01-01T09:00:00";

    // 오늘 날짜의 doing 인스턴스와, 지난 overdue 인스턴스가 같은 시리즈에 공존.
    const doingInstance = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const overdueInstance = makeTodo({
      id: "overdue-1",
      status: "todo",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([doingInstance, overdueInstance]) as ReturnType<
        typeof getDocs
      > extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");

    // overdue-1을 열어 마감일을 doing-1이 이미 점유한 오늘 날짜로 옮기려는 시도.
    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await expect(
      editRecurringSeries(fakeDb, UID, seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10)),
    ).rejects.toThrow();
    expect(batch.update).not.toHaveBeenCalled();
  });
});

describe("editRecurringSeries — 회차 수정 시 시리즈 종료 조건 유지 (회귀)", () => {
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

  it("무기한 매일 시리즈의 내일 회차를 수정해도 호라이즌까지의 회차가 모두 재생성된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    // 시스템 시간은 파일 상단 beforeEach에서 mock된다. 실제 회차처럼 startAt=dueAt=그 회차일(UTC Z)로 둔다.
    const today = new Date();
    const occurrence = (offsetDays: number) =>
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + offsetDays,
        9,
        0,
        0,
      ).toISOString();
    const tomorrowIso = occurrence(1);
    const indefiniteDaily: RecurrenceRule = { type: "daily", endType: "indefinite", endDate: null };

    const instances = [1, 2, 3].map((d) =>
      makeTodo({
        id: `series-1_${d}`,
        startAt: occurrence(d),
        dueAt: occurrence(d),
        recurrenceId: "series-1",
        recurrence: indefiniteDaily,
      }),
    );
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot(instances) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../seriesApi");
    const { toRecurrenceRule, toRecurrenceRuleForEdit } = await import("../recurrenceForm");

    // 수정 폼은 회차의 dueAt(=내일)을 그대로 채운다. 예전 경로(toRecurrenceRule)는 이 값을
    // 종료일로 바꿔 시리즈를 내일에서 끊었다.
    expect(toRecurrenceRule({ type: "daily" }, tomorrowIso)?.endType).toBe("untilDate");
    const rule = toRecurrenceRuleForEdit({ type: "daily" }, indefiniteDaily);
    const horizonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instances[0], title: "바뀐 제목", recurrence: rule },
      horizonEnd,
    );

    // 내일(+1)부터 호라이즌(+10)까지 10개 회차가 다시 만들어져야 한다.
    const setDueAts = batch.set.mock.calls.map(
      (call) => (call[1] as { dueAt: string }).dueAt,
    );
    expect(setDueAts).toEqual(Array.from({ length: 10 }, (_, i) => occurrence(i + 1)));
    const setRules = batch.set.mock.calls.map(
      (call) => (call[1] as { recurrence: RecurrenceRule }).recurrence,
    );
    setRules.forEach((r) => expect(r.endType).toBe("indefinite"));
  });
});

describe("deleteRecurringSeries", () => {
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

  it("editRecurringSeries와 달리 done/doing 상태와 무관하게 같은 recurrenceId의 모든 인스턴스를 삭제한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const doneInstance = makeTodo({ id: "done-1", status: "done", recurrenceId: "series-1", recurrence: dailyRule });
    const doingInstance = makeTodo({ id: "doing-1", status: "doing", recurrenceId: "series-1", recurrence: dailyRule });
    const todoInstance = makeTodo({ id: "todo-1", status: "todo", recurrenceId: "series-1", recurrence: dailyRule });

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([doneInstance, doingInstance, todoInstance]) as ReturnType<
        typeof getDocs
      > extends Promise<infer T>
        ? T
        : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { deleteRecurringSeries } = await import("../seriesApi");

    await deleteRecurringSeries(fakeDb, UID, "series-1");

    // done/doing 포함 3건 전부 삭제 대상이어야 한다 (editRecurringSeries의 보존 정책과 다름)
    expect(batch.delete).toHaveBeenCalledTimes(3);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("삭제 대상 인스턴스가 없으면 아무것도 지우지 않고 commit만 한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { deleteRecurringSeries } = await import("../seriesApi");

    await deleteRecurringSeries(fakeDb, UID, "series-empty");

    expect(batch.delete).not.toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("반복 시리즈 쓰기 함수 직렬화(withRecurringSeriesLock)", () => {
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

  it("editRecurringSeries의 조회가 끝나기 전에 deleteRecurringSeries를 호출하면, delete의 조회는 edit의 commit 이후에야 실행된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");

    const futureInstance = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-edit",
      recurrence: dailyRule,
    });

    let resolveEditRead: (value: unknown) => void = () => {};
    const editReadPromise = new Promise((resolve) => {
      resolveEditRead = resolve;
    });

    vi.mocked(getDocs)
      // 1) edit의 시리즈 조회 - 의도적으로 지연시켜 "느린 네트워크"를 흉내낸다
      .mockImplementationOnce(() => editReadPromise as ReturnType<typeof getDocs>)
      // 2) edit의 getNextRootOrder 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      // 3) delete의 시리즈 조회
      .mockResolvedValueOnce(
        toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );

    const editBatch = makeBatch();
    const deleteBatch = makeBatch();
    vi.mocked(writeBatch)
      .mockReturnValueOnce(editBatch as unknown as ReturnType<typeof writeBatch>)
      .mockReturnValueOnce(deleteBatch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries, deleteRecurringSeries } = await import("../seriesApi");

    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: "2026-07-12T09:00:00",
      dueAt: "2026-07-12T09:00:00",
      title: "수정된 제목",
      recurrenceId: "series-edit",
      recurrence: dailyRule,
    });
    const editPromise = editRecurringSeries(fakeDb, UID, seriesTodo, new Date("2026-07-20T00:00:00"));
    const deletePromise = deleteRecurringSeries(fakeDb, UID, "series-edit");

    // edit의 첫 조회가 아직 끝나지 않은 시점 - delete가 새치기해 자신의 조회를 먼저
    // 실행하면 안 된다 (직렬화가 안 되어 있으면 이 시점에 getDocs가 2번 호출됨)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(getDocs).mock.calls.length).toBe(1);

    resolveEditRead(
      toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    await editPromise;
    await deletePromise;

    expect(editBatch.commit).toHaveBeenCalledTimes(1);
    expect(deleteBatch.commit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getDocs).mock.calls.length).toBe(3);
    // delete의 조회(3번째 getDocs)는 edit의 batch.commit 이후에 호출되어야 한다.
    const deleteReadOrder = vi.mocked(getDocs).mock.invocationCallOrder[2];
    const editCommitOrder = editBatch.commit.mock.invocationCallOrder[0];
    expect(deleteReadOrder).toBeGreaterThan(editCommitOrder);
  });
});

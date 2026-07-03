import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Todo, RecurrenceRule } from "../../types/todo.type";

// Firebase 모킹 - 실제 Firebase에 연결하지 않도록 처리
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "test-user-id" },
  },
  googleProvider: {},
}));

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

    const { createRecurringTodo } = await import("../todoApi");

    const todo = makeTodo({
      dueAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const created = await createRecurringTodo(todo, horizonEnd);

    expect(created).toHaveLength(4); // 7/10, 11, 12, 13
    const recurrenceIds = new Set(created.map((t) => t.recurrenceId));
    expect(recurrenceIds.size).toBe(1);
    expect(batch.set).toHaveBeenCalledTimes(4);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    created.forEach((t) => {
      expect(t.status).toBe("todo");
    });
  });

  it("recurrence가 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../todoApi");
    const todo = makeTodo({ dueAt: "2026-07-10T09:00:00", recurrence: null });

    await expect(createRecurringTodo(todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
  });

  it("dueAt이 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../todoApi");
    const todo = makeTodo({ dueAt: null, recurrence: dailyRule });

    await expect(createRecurringTodo(todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "done-1",
      status: "done",
      dueAt: "2026-07-01T09:00:00",
      title: "새 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, new Date("2026-08-01T00:00:00"));

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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: "2026-07-05T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, new Date("2026-08-01T00:00:00"));

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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, new Date("2026-08-01T00:00:00"));

    expect(batch.delete).not.toHaveBeenCalled();
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

    const { editRecurringSeries } = await import("../todoApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      title: "바뀐 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, horizonEnd);

    expect(batch.delete).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalledTimes(1);
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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: null, // 반복 OFF
    });

    await editRecurringSeries(seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30));

    // 미래 인스턴스 1개만 삭제, done/overdue는 보존
    expect(batch.delete).toHaveBeenCalledTimes(1);
    // OFF 전환이므로 재생성 없음 (getDocs가 재생성용 order 조회를 위해 2번째로 호출되지 않음)
    expect(batch.set).not.toHaveBeenCalled();
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it("recurrenceId가 없으면 에러를 던진다", async () => {
    const { editRecurringSeries } = await import("../todoApi");
    const todo = makeTodo({ recurrenceId: null });

    await expect(editRecurringSeries(todo, new Date())).rejects.toThrow();
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

    const { editRecurringSeries } = await import("../todoApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 사용자가 그 doing 인스턴스 자체를 열어 제목만 바꾸고 저장 (dueAt/recurrence는 그대로).
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      dueAt: todayIso,
      title: "수정된 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, horizonEnd);

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

    const { deleteRecurringSeries } = await import("../todoApi");

    await deleteRecurringSeries("series-1");

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

    const { deleteRecurringSeries } = await import("../todoApi");

    await deleteRecurringSeries("series-empty");

    expect(batch.delete).not.toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

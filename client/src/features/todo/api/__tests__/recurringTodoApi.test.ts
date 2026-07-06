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

  it("생성한 인스턴스 문서 ID는 {recurrenceId}_{날짜} 형태로 결정론적이다 (멀티탭/멀티기기 동시 생성 시 중복 방지)", async () => {
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
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const created = await createRecurringTodo(todo, horizonEnd);

    // recurrenceId는 createRecurringTodoImpl 내부에서 doc(todosRef).id로 딱 한 번 생성되므로
    // 테스트 환경(autoIdCounter)에서는 "auto-1"로 고정된다.
    expect(created.map((t) => t.id)).toEqual([
      "auto-1_2026-07-10",
      "auto-1_2026-07-11",
      "auto-1_2026-07-12",
    ]);
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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      description: "수정된 설명",
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, new Date("2026-08-01T00:00:00"));

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

    const { editRecurringSeries } = await import("../todoApi");

    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3));

    const setCall = batch.set.mock.calls[0] as [{ id: string }, { dueAt: string }];
    const [docRef] = setCall;
    // toDateString()과 동일하게 로컬 타임존 기준 연-월-일로 키를 계산한다(구현과 동일한 방식으로 기대값 산출).
    const d = new Date(futureIso);
    const expectedDateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(docRef.id).toBe(`series-1_${expectedDateKey}`);
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

    const { editRecurringSeries } = await import("../todoApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 사용자가 doing 인스턴스를 열어 설명만 바꾸고 저장 (status/dueAt/recurrence는 그대로).
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      description: "수정된 설명",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, horizonEnd);

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

    const { editRecurringSeries } = await import("../todoApi");

    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);
    // 다른 사용자의 userId를 흉내내 보내더라도 반영되면 안 된다.
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      userId: "다른-사용자-id",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await editRecurringSeries(seriesTodo, horizonEnd);

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

    const { editRecurringSeries } = await import("../todoApi");

    // overdue-1을 열어 마감일을 doing-1이 이미 점유한 오늘 날짜로 옮기려는 시도.
    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    await expect(
      editRecurringSeries(seriesTodo, new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10)),
    ).rejects.toThrow();
    expect(batch.update).not.toHaveBeenCalled();
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

describe("extendIndefiniteRecurringSeries", () => {
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
    const now = new Date("2026-07-10T00:00:00");
    const latestExisting = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-15T00:00:00");

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      // getNextRootOrder용 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { extendIndefiniteRecurringSeries } = await import("../todoApi");
    await extendIndefiniteRecurringSeries(horizonEnd);
    void now;

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

    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([latestExisting]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { extendIndefiniteRecurringSeries } = await import("../todoApi");
    await extendIndefiniteRecurringSeries(horizonEnd);

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

    const { extendIndefiniteRecurringSeries } = await import("../todoApi");
    await extendIndefiniteRecurringSeries(horizonEnd);

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

    const { extendIndefiniteRecurringSeries } = await import("../todoApi");
    await extendIndefiniteRecurringSeries(horizonEnd);

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

    const { extendIndefiniteRecurringSeries } = await import("../todoApi");
    await extendIndefiniteRecurringSeries(new Date("2026-08-01T00:00:00"));

    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
  });
});

describe("extendIndefiniteRecurringSeries와 editRecurringSeries 동시 실행", () => {
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

  // 버그 재현: App 마운트 시 extendIndefiniteRecurringSeries가 백그라운드로 실행되는 동안
  // 사용자가 반복 시리즈를 수정(editRecurringSeries)하면, 두 함수가 각자 읽은(stale) 스냅샷을
  // 기준으로 독립적으로 batch를 커밋해 같은 recurrenceId/날짜에 문서가 중복 생성될 수 있다.
  // 이를 막으려면 두 함수(및 시리즈를 쓰는 다른 함수들)가 서로 겹쳐 실행되지 않고 순서대로
  // (직렬로) 실행되어야 한다.
  it("extend 실행 중 editRecurringSeries를 호출하면 extend가 완전히 끝난 뒤에 실행된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const horizonEnd = new Date("2026-07-15T00:00:00");

    const indefiniteInstance = makeTodo({
      id: "latest-1",
      status: "todo",
      dueAt: "2026-07-11T09:00:00",
      recurrenceId: "series-extend",
      recurrence: dailyRule,
    });

    const futureEditInstance = makeTodo({
      id: "future-edit-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      recurrenceId: "series-edit",
      recurrence: dailyRule,
    });

    let resolveExtendRead: (value: unknown) => void = () => {};
    const extendReadPromise = new Promise((resolve) => {
      resolveExtendRead = resolve;
    });

    vi.mocked(getDocs)
      // 1) extend의 전체 조회 - 의도적으로 지연시켜 "느린 네트워크"를 흉내낸다
      .mockImplementationOnce(() => extendReadPromise as ReturnType<typeof getDocs>)
      // 2) extend의 getNextRootOrder 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      // 3) edit의 시리즈 조회
      .mockResolvedValueOnce(
        toDocSnapshot([futureEditInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      )
      // 4) edit의 getNextRootOrder 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );

    const extendBatch = makeBatch();
    const editBatch = makeBatch();
    vi.mocked(writeBatch)
      .mockReturnValueOnce(extendBatch as unknown as ReturnType<typeof writeBatch>)
      .mockReturnValueOnce(editBatch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries, extendIndefiniteRecurringSeries } = await import("../todoApi");

    const extendPromise = extendIndefiniteRecurringSeries(horizonEnd);

    const seriesTodo = makeTodo({
      id: "future-edit-1",
      status: "todo",
      dueAt: "2026-07-12T09:00:00",
      title: "수정된 제목",
      recurrenceId: "series-edit",
      recurrence: dailyRule,
    });
    const editPromise = editRecurringSeries(seriesTodo, new Date("2026-07-20T00:00:00"));

    // extend의 첫 조회가 아직 끝나지 않은 시점 - edit이 새치기해서 자신의 조회를
    // 먼저 실행하면 안 된다 (직렬화가 안 되어 있으면 이 시점에 getDocs가 2번 이상 호출됨)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(getDocs).mock.calls.length).toBe(1);
    expect(editBatch.commit).not.toHaveBeenCalled();

    resolveExtendRead(
      toDocSnapshot([indefiniteInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
        ? T
        : never,
    );
    await extendPromise;
    expect(extendBatch.commit).toHaveBeenCalledTimes(1);

    await editPromise;
    expect(editBatch.commit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getDocs).mock.calls.length).toBe(4);
  });
});

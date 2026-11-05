import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Firestore } from "firebase/firestore";
import type { Todo, RecurrenceRule } from "../../types/todo";
import { buildRecurringInstanceId } from "../recurrence";

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

  // 일반 할 일을 반복으로 전환하면 웹 폼은 원본 Todo 전체를 넘긴다. 원본이 숨김(overdueArchived)
  // 상태였거나 구글 이벤트에 매핑돼 있었다면 그 값이 새 회차 전부에 복사되면 안 된다.
  it("입력의 overdueArchived: true를 물려받지 않고 모든 인스턴스를 overdueArchived: false로 생성한다", async () => {
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
      makeTodo({ recurrence: dailyRule, startAt: "2026-07-10T09:00:00", overdueArchived: true }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    batch.set.mock.calls.forEach(([, data]) => {
      expect(data.overdueArchived).toBe(false);
    });
  });

  it("입력의 googleEventId를 인스턴스에 복사하지 않는다 (회차 N개가 구글 이벤트 1개에 매핑되는 것 방지)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../seriesApi");
    const created = await createRecurringTodo(
      fakeDb,
      UID,
      makeTodo({ recurrence: dailyRule, startAt: "2026-07-10T09:00:00", googleEventId: "gev-1" }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    batch.set.mock.calls.forEach(([, data]) => {
      expect(data).not.toHaveProperty("googleEventId");
    });
    created.forEach((t) => expect(t).not.toHaveProperty("googleEventId"));
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

  // 보존된(overdue) 회차를 직접 갱신하는 경로. 입력은 폼을 연 시점의 값이라 문서에 저장된
  // 최신 값보다 오래됐을 수 있다.
  describe("보존된 회차 직접 갱신 시 문서별 필드", () => {
    const pastIso = "2020-01-01T09:00:00";
    const stored = (overrides: Partial<Todo> = {}) =>
      makeTodo({
        id: "overdue-1",
        status: "todo",
        startAt: pastIso,
        dueAt: pastIso,
        recurrenceId: "series-1",
        recurrence: dailyRule,
        ...overrides,
      });

    const run = async (storedTodo: Todo, input: Todo) => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      vi.mocked(getDocs)
        .mockResolvedValueOnce(
          toDocSnapshot([storedTodo]) as ReturnType<typeof getDocs> extends Promise<infer T>
            ? T
            : never,
        )
        .mockResolvedValueOnce(
          emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
        );
      const batch = makeBatch();
      vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);
      const { editRecurringSeries } = await import("../seriesApi");
      await editRecurringSeries(fakeDb, UID, input, new Date("2026-08-01T00:00:00"));
      const calls = batch.update.mock.calls.filter(
        (call) => (call[0] as { id: string }).id === "overdue-1",
      );
      expect(calls).toHaveLength(1);
      return calls[0][1] as Record<string, unknown>;
    };

    it("폼 입력의 googleEventId로 문서를 덮어쓰지 않는다 (동기화가 기록한 최신 값 보존)", async () => {
      const data = await run(
        stored({ googleEventId: "gev-new" }),
        stored({ googleEventId: "gev-stale", description: "수정" }),
      );

      expect(data).not.toHaveProperty("googleEventId");
    });

    it("숨겨진 회차의 마감일을 오늘 이후로 옮기면 숨김을 해제한다", async () => {
      const futureIso = "2026-07-20T09:00:00";
      const data = await run(
        stored({ overdueArchived: true }),
        stored({ overdueArchived: true, startAt: futureIso, dueAt: futureIso }),
      );

      expect(data.overdueArchived).toBe(false);
    });

    it("숨겨진 회차를 수정해도 마감일이 여전히 지났으면 숨김 값을 건드리지 않는다", async () => {
      const data = await run(
        stored({ overdueArchived: true }),
        stored({ overdueArchived: true, description: "수정" }),
      );

      expect(data).not.toHaveProperty("overdueArchived");
    });
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

  // 숨겨진(overdueArchived) 회차나 구글 이벤트에 매핑된 회차를 열어 시리즈를 수정하면
  // 그 회차의 값이 입력으로 들어온다 — 재생성되는 새 회차들이 이를 물려받으면 안 된다.
  it("입력의 overdueArchived: true를 물려받지 않고 재생성 인스턴스는 overdueArchived: false다", async () => {
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
        overdueArchived: true,
      }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    batch.set.mock.calls.forEach(([, data]) => {
      expect(data.overdueArchived).toBe(false);
    });
  });

  it("구글 이벤트에 매핑된 회차를 열어 수정해도 재생성 인스턴스에 googleEventId를 복사하지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
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
        googleEventId: "gev-1",
      }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    batch.set.mock.calls.forEach(([, data]) => {
      expect(data).not.toHaveProperty("googleEventId");
    });
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
    const otherFutureInstance = makeTodo({
      id: "future-2",
      status: "todo",
      dueAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 4).toISOString(),
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });

    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot([futureInstance, otherFutureInstance, overdueInstance, doneInstance]) as ReturnType<
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

    // 수정 중인 future-1은 일반 할 일로 남고(아래 OFF 전용 describe에서 상세 검증), 다른 미래
    // 인스턴스(future-2)만 삭제, done/overdue는 보존
    expect(batch.delete).toHaveBeenCalledTimes(1);
    expect(batch.delete).toHaveBeenCalledWith({ id: "future-2" });
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
    const { toFormValue, toRecurrenceRule } = await import("../recurrenceForm");

    // 종료 조건은 dueAt이 아니라 폼 값에서 온다. 무기한 시리즈를 폼 값으로 왕복해도
    // (회차 dueAt=내일과 무관하게) 무기한이 유지돼야 한다.
    const rule = toRecurrenceRule(toFormValue(indefiniteDaily));
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

describe("editRecurringSeries — 반복 OFF 시 수정 중인 회차를 일반 할 일로 남김", () => {
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

  // 시스템 시간은 파일 상단 beforeEach에서 mock된다. 실제 회차처럼 startAt=dueAt=그 회차일(UTC Z).
  const occurrence = (offsetDays: number) => {
    const today = new Date();
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offsetDays,
      9,
      0,
      0,
    ).toISOString();
  };

  // 실제 문서 ID 형식({recurrenceId}_{날짜})을 써서 정리 작업이 만들 ID와의 충돌이 실제로 재현되게 한다.
  const idOf = (offsetDays: number) => buildRecurringInstanceId("series-1", occurrence(offsetDays));

  const instance = (offsetDays: number, overrides: Partial<Todo> = {}) =>
    makeTodo({
      id: idOf(offsetDays),
      title: "원래 제목",
      startAt: occurrence(offsetDays),
      dueAt: occurrence(offsetDays),
      recurrenceId: "series-1",
      recurrence: dailyRule,
      ...overrides,
    });

  const setup = async (todos: Todo[]) => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      toDocSnapshot(todos) as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);
    const { editRecurringSeries } = await import("../seriesApi");
    return { batch, editRecurringSeries, getDocs };
  };

  const deletedIds = (batch: ReturnType<typeof makeBatch>) =>
    batch.delete.mock.calls.map((call) => (call[0] as { id: string }).id).sort();
  const sorted = (ids: string[]) => [...ids].sort();

  // 수정 중인 문서에 대한 update 호출만 골라낸다(반복 OFF면 남는 형제 회차에도 update가 간다).
  const updateFor = (batch: ReturnType<typeof makeBatch>, id: string) =>
    batch.update.mock.calls.filter((call) => (call[0] as { id: string }).id === id);

  const horizon = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  };

  const fullSeries = () => [
    instance(-2), // overdue
    instance(-1, { status: "done", doneAt: occurrence(-1) }),
    instance(0),
    instance(1),
    instance(2),
  ];

  it("내일 회차를 수정하며 반복을 끄면 그 문서는 삭제되지 않고 recurrence/recurrenceId가 null인 일반 할 일로 갱신된다", async () => {
    const { batch, editRecurringSeries, getDocs } = await setup(fullSeries());

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instance(1), title: "바뀐 제목", priority: "high", recurrence: null },
      horizon(),
    );

    // 수정 중인 내일(+1) 회차는 남고, 그 이후 todo(+2)만 삭제. 앞선 오늘 회차와 done/overdue는
    // 보존(규칙만 지움) — 시리즈 수정은 "이 회차와 이후 회차"에만 적용된다.
    expect(deletedIds(batch)).toEqual(sorted([idOf(2)]));
    const keptCalls = updateFor(batch, idOf(1));
    expect(keptCalls).toHaveLength(1);
    const data = keptCalls[0][1] as Record<string, unknown>;
    expect(data).toMatchObject({
      title: "바뀐 제목",
      priority: "high",
      recurrence: null,
      recurrenceId: null,
      userId: UID,
      startAt: occurrence(1),
      dueAt: occurrence(1),
    });
    // 저장된 진행 상태는 덮어쓰지 않는다.
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("doneAt");
    expect(batch.set).not.toHaveBeenCalled();
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it("일반 할 일로 남기는 갱신은 폼 입력의 googleEventId로 문서를 덮어쓰지 않는다", async () => {
    const { batch, editRecurringSeries } = await setup([
      instance(0),
      instance(1, { googleEventId: "gev-new" }),
    ]);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instance(1), googleEventId: "gev-stale", recurrence: null },
      horizon(),
    );

    const keptCalls = updateFor(batch, idOf(1));
    expect(keptCalls).toHaveLength(1);
    expect(keptCalls[0][1]).not.toHaveProperty("googleEventId");
  });

  it("오늘 회차를 수정하며 반복을 끄면 그 문서가 일반 할 일로 남는다", async () => {
    const { batch, editRecurringSeries } = await setup(fullSeries());

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instance(0), title: "오늘 바뀐 제목", recurrence: null },
      horizon(),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(1), idOf(2)]));
    const keptCalls = updateFor(batch, idOf(0));
    expect(keptCalls).toHaveLength(1);
    const data = keptCalls[0][1] as Record<string, unknown>;
    expect(data).toMatchObject({ title: "오늘 바뀐 제목", recurrence: null, recurrenceId: null });
    expect(batch.set).not.toHaveBeenCalled();
  });

  it("doing 회차를 수정하며 반복을 끄면 그 문서가 recurrenceId null인 일반 할 일로 남는다", async () => {
    const series = [instance(0, { status: "doing" }), instance(1), instance(2)];
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[0], title: "진행 중 제목", recurrence: null },
      horizon(),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(1), idOf(2)]));
    const keptCalls = updateFor(batch, idOf(0));
    expect(keptCalls).toHaveLength(1);
    const data = keptCalls[0][1] as Record<string, unknown>;
    expect(data).toMatchObject({ title: "진행 중 제목", recurrence: null, recurrenceId: null });
    expect(data).not.toHaveProperty("status");
  });

  it("done 회차를 수정하며 반복을 끄면 그 문서는 일반 할 일로 분리하지 않고(규칙만 지움) 미래 todo만 삭제한다", async () => {
    const series = fullSeries();
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[1], title: "완료 회차 제목", recurrence: null },
      horizon(),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(0), idOf(1), idOf(2)]));
    // 완료 회차는 일반 할 일로 분리하지 않는다 — 수정 내용은 반영되지 않고, 남는 다른
    // 회차와 똑같이 반복 규칙만 지워진다(정리 작업이 시리즈를 되살리지 않도록).
    const doneCalls = updateFor(batch, idOf(-1));
    expect(doneCalls).toHaveLength(1);
    expect(doneCalls[0][1]).toEqual({ recurrence: null, updatedAt: new Date().toISOString() });
    expect(batch.set).not.toHaveBeenCalled();
  });

  it("반복을 끄면 남는 done/overdue/앞선 todo 형제 회차는 recurrence만 null로 바뀌고 recurrenceId 등 다른 필드는 그대로다", async () => {
    const { batch, editRecurringSeries } = await setup(fullSeries());

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instance(1), title: "바뀐 제목", recurrence: null },
      horizon(),
    );

    const now = new Date().toISOString();
    for (const siblingId of [idOf(-2), idOf(-1), idOf(0)]) {
      const calls = updateFor(batch, siblingId);
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ recurrence: null, updatedAt: now });
    }
    // 앞선 형제 3개(overdue, done, 오늘 todo) + 일반 할 일로 남는 회차 1개
    expect(batch.update).toHaveBeenCalledTimes(4);
    expect(deletedIds(batch)).toEqual(sorted([idOf(2)]));
  });

  it("(회귀) 반복 OFF 후 상태로 앱 시작 정리 작업을 돌려도 시리즈를 이어 만들지 않고, 남긴 문서 ID를 덮어쓰지 않는다", async () => {
    const series = fullSeries();
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...instance(1), title: "바뀐 제목", recurrence: null },
      horizon(),
    );

    // batch에 쌓인 쓰기를 fixture에 적용해 OFF 저장 이후의 Firestore 상태를 만든다.
    const deleted = new Set(deletedIds(batch));
    const afterOff: Todo[] = series
      .filter((t) => !deleted.has(t.id))
      .map((t) =>
        batch.update.mock.calls
          .filter((call) => (call[0] as { id: string }).id === t.id)
          .reduce<Todo>((acc, call) => ({ ...acc, ...(call[1] as Partial<Todo>) }), t),
      );
    expect(afterOff.find((t) => t.id === idOf(1))).toMatchObject({
      title: "바뀐 제목",
      recurrenceId: null,
    });

    const { planIndefiniteExtension, buildExtensionCreates } = await import(
      "../startupMaintenance"
    );
    const extensions = planIndefiniteExtension(afterOff, horizon());
    expect(extensions).toEqual([]);
    const creates = buildExtensionCreates(extensions, 0, UID, new Date().toISOString());
    expect(creates.map((c) => c.id)).not.toContain(idOf(1));
    expect(creates).toEqual([]);
  });

  it("일반 할 일로 남는 회차는 시리즈를 떠나므로 보존된 형제(done)와 같은 날짜로 마감일을 옮겨도 막지 않는다", async () => {
    const { batch, editRecurringSeries } = await setup(fullSeries());

    await expect(
      editRecurringSeries(
        fakeDb,
        UID,
        { ...instance(1), startAt: occurrence(-1), dueAt: occurrence(-1), recurrence: null },
        horizon(),
      ),
    ).resolves.toBeUndefined();

    const keptCalls = updateFor(batch, idOf(1));
    expect(keptCalls).toHaveLength(1);
    const data = keptCalls[0][1] as Record<string, unknown>;
    expect(data).toMatchObject({ dueAt: occurrence(-1), recurrenceId: null });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("editRecurringSeries — 이 회차와 이후 회차에만 적용 (앞선 회차 보존)", () => {
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

  // 시스템 시간은 파일 상단 beforeEach에서 mock된다. 실제 회차처럼 startAt=dueAt=그 회차일(UTC Z).
  const occurrence = (offsetDays: number) => {
    const today = new Date();
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offsetDays,
      9,
      0,
      0,
    ).toISOString();
  };
  const idOf = (offsetDays: number) => buildRecurringInstanceId("series-1", occurrence(offsetDays));
  const instance = (offsetDays: number, rule: RecurrenceRule, overrides: Partial<Todo> = {}) =>
    makeTodo({
      id: idOf(offsetDays),
      title: "원래 제목",
      startAt: occurrence(offsetDays),
      dueAt: occurrence(offsetDays),
      recurrenceId: "series-1",
      recurrence: rule,
      ...overrides,
    });
  const horizonAt = (offsetDays: number) => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  };

  const setup = async (todos: Todo[]) => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot(todos) as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);
    const { editRecurringSeries } = await import("../seriesApi");
    return { batch, editRecurringSeries };
  };

  const deletedIds = (batch: ReturnType<typeof makeBatch>) =>
    batch.delete.mock.calls.map((call) => (call[0] as { id: string }).id).sort();
  const setIds = (batch: ReturnType<typeof makeBatch>) =>
    batch.set.mock.calls.map((call) => (call[0] as { id: string }).id);
  const updateFor = (batch: ReturnType<typeof makeBatch>, id: string) =>
    batch.update.mock.calls.filter((call) => (call[0] as { id: string }).id === id);
  const sorted = (ids: string[]) => [...ids].sort();

  it("오늘 시작한 매일 시리즈의 내일 회차 제목을 바꾸면 오늘 회차는 지우지 않고 내일부터 호라이즌까지만 새 제목으로 재생성한다", async () => {
    const series = [0, 1, 2, 3].map((d) => instance(d, dailyRule));
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[1], title: "바뀐 제목" },
      horizonAt(5),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(1), idOf(2), idOf(3)]));
    expect(setIds(batch)).toEqual([1, 2, 3, 4, 5].map(idOf));
    batch.set.mock.calls.forEach((call) => {
      expect(call[1]).toMatchObject({ title: "바뀐 제목", status: "todo" });
    });
    // 오늘 회차에는 아무 쓰기도 가지 않는다.
    expect(updateFor(batch, idOf(0))).toHaveLength(0);
    expect(batch.update).not.toHaveBeenCalled();
  });

  it("내일 회차에서 반복을 끄면 오늘 회차는 규칙만 지워 남기고, 내일 회차는 일반 할 일로 남기고, 모레부터만 삭제한다", async () => {
    const series = [0, 1, 2, 3].map((d) => instance(d, dailyRule));
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[1], title: "바뀐 제목", recurrence: null },
      horizonAt(5),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(2), idOf(3)]));
    const todayCalls = updateFor(batch, idOf(0));
    expect(todayCalls).toHaveLength(1);
    expect(todayCalls[0][1]).toEqual({ recurrence: null, updatedAt: new Date().toISOString() });
    const keptCalls = updateFor(batch, idOf(1));
    expect(keptCalls).toHaveLength(1);
    expect(keptCalls[0][1]).toMatchObject({
      title: "바뀐 제목",
      recurrence: null,
      recurrenceId: null,
    });
    expect(batch.set).not.toHaveBeenCalled();
  });

  it("오늘 회차를 수정하면 오늘부터 호라이즌까지 전부 재생성한다 (기존 동작 유지)", async () => {
    const series = [0, 1, 2, 3].map((d) => instance(d, dailyRule));
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[0], title: "바뀐 제목" },
      horizonAt(5),
    );

    expect(deletedIds(batch)).toEqual(sorted([0, 1, 2, 3].map(idOf)));
    expect(setIds(batch)).toEqual([0, 1, 2, 3, 4, 5].map(idOf));
  });

  it("앞선 회차가 doing/done이어도 그대로 두고, 수정 회차부터만 재생성한다", async () => {
    const series = [
      instance(-1, dailyRule, { status: "done", doneAt: occurrence(-1) }),
      instance(0, dailyRule, { status: "doing" }),
      instance(1, dailyRule),
      instance(2, dailyRule),
      instance(3, dailyRule),
    ];
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[3], title: "바뀐 제목" },
      horizonAt(4),
    );

    // 앞선 todo(+1)도 지우지 않는다.
    expect(deletedIds(batch)).toEqual(sorted([idOf(2), idOf(3)]));
    expect(setIds(batch)).toEqual([2, 3, 4].map(idOf));
    expect(batch.update).not.toHaveBeenCalled();
  });

  it("수정 회차가 지난 미완료(overdue)면 그 회차만 직접 갱신하고 오늘부터 재생성한다 (기존 동작 유지)", async () => {
    const series = [-2, 0, 1].map((d) => instance(d, dailyRule));
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[0], title: "바뀐 제목" },
      horizonAt(2),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(0), idOf(1)]));
    expect(setIds(batch)).toEqual([0, 1, 2].map(idOf));
    const editedCalls = updateFor(batch, idOf(-2));
    expect(editedCalls).toHaveLength(1);
    expect(editedCalls[0][1]).toMatchObject({ title: "바뀐 제목" });
  });

  it("매주 시리즈: 다음 주 회차를 수정하면 이번 주 회차는 지우지 않는다", async () => {
    const weekday = new Date(occurrence(0)).getDay();
    const weeklyRule: RecurrenceRule = {
      type: "weekly",
      weekdays: [weekday],
      endType: "indefinite",
    };
    const series = [0, 7, 14].map((d) => instance(d, weeklyRule));
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[1], title: "바뀐 제목" },
      horizonAt(21),
    );

    expect(deletedIds(batch)).toEqual(sorted([idOf(7), idOf(14)]));
    expect(setIds(batch)).toEqual([7, 14, 21].map(idOf));
  });

  it("매월 시리즈: 다음 달 회차를 수정하면 이번 달 회차는 지우지 않는다", async () => {
    const today = new Date();
    const monthOcc = (m: number) =>
      new Date(today.getFullYear(), today.getMonth() + m, today.getDate(), 9, 0, 0).toISOString();
    const monthlyRule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const series = [0, 1].map((m) =>
      makeTodo({
        id: buildRecurringInstanceId("series-1", monthOcc(m)),
        startAt: monthOcc(m),
        dueAt: monthOcc(m),
        recurrenceId: "series-1",
        recurrence: monthlyRule,
      }),
    );
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      { ...series[1], title: "바뀐 제목" },
      new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()),
    );

    expect(deletedIds(batch)).toEqual([series[1].id]);
    expect(setIds(batch)).toEqual([1, 2].map((m) => buildRecurringInstanceId("series-1", monthOcc(m))));
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

describe("editRecurringSeries — 재생성 0개 허용 (종료일 선택 도입)", () => {
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

  // 7월 기준 로컬 시각(09:00) 회차. UTC 리터럴을 쓰지 않는다(뉴욕 TZ에서 날짜가 밀림).
  const julyAt = (day: number) => new Date(2026, 6, day, 9, 0).toISOString();
  const RID = "series-end";
  const instanceOn = (day: number, rule: RecurrenceRule, overrides: Partial<Todo> = {}) =>
    makeTodo({
      id: buildRecurringInstanceId(RID, julyAt(day)),
      title: "원래 제목",
      startAt: julyAt(day),
      dueAt: julyAt(day),
      recurrenceId: RID,
      recurrence: rule,
      ...overrides,
    });

  const setup = async (todos: Todo[]) => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot(todos) as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);
    const { editRecurringSeries } = await import("../seriesApi");
    return { batch, editRecurringSeries };
  };

  const idsOf = (mock: { mock: { calls: unknown[][] } }) =>
    mock.mock.calls.map((call) => (call[0] as { id: string }).id).sort();

  it("이미 지난 종료일 시리즈의 지난 회차 제목만 고쳐도 저장된다", async () => {
    vi.setSystemTime(new Date(2026, 6, 20, 0, 0));
    const rule: RecurrenceRule = {
      type: "daily",
      endType: "untilDate",
      endDate: "2026-07-15",
    };
    const series = [10, 11, 12].map((d) => instanceOn(d, rule));
    const { batch, editRecurringSeries } = await setup(series);

    await expect(
      editRecurringSeries(
        fakeDb,
        UID,
        { ...series[2], title: "바뀐 제목" },
        new Date(2026, 6, 25),
      ),
    ).resolves.toBeUndefined();

    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(batch.set).not.toHaveBeenCalled();
    expect(idsOf(batch.update)).toEqual([series[2].id]);
    expect(batch.update.mock.calls[0][1]).toMatchObject({ title: "바뀐 제목" });
  });

  it("종료일을 수정 회차 날짜로 줄이면 그 회차는 남고 이후 todo 회차만 지워진다", async () => {
    const openRule: RecurrenceRule = { type: "daily", endType: "indefinite", endDate: null };
    const series = [
      instanceOn(9, openRule, { status: "done", doneAt: julyAt(9) }),
      ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((d) => instanceOn(d, openRule)),
    ];
    const edited = series.find((t) => t.id === buildRecurringInstanceId(RID, julyAt(12)))!;
    const { batch, editRecurringSeries } = await setup(series);

    await editRecurringSeries(
      fakeDb,
      UID,
      {
        ...edited,
        recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-12" },
      },
      new Date(2026, 6, 20),
    );

    expect(idsOf(batch.delete)).toEqual(
      [12, 13, 14, 15, 16, 17, 18, 19, 20]
        .map((d) => buildRecurringInstanceId(RID, julyAt(d)))
        .sort(),
    );
    expect(idsOf(batch.set)).toEqual([`${RID}_2026-07-12`]);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("시작일시가 호라이즌 밖이면 여전히 실패하고 commit하지 않는다", async () => {
    const rule: RecurrenceRule = { type: "daily", endType: "indefinite", endDate: null };
    const series = [10, 11].map((d) => instanceOn(d, rule));
    const { batch, editRecurringSeries } = await setup(series);
    const horizon = new Date(2026, 6, 20);
    const farStart = new Date(2026, 6, 30, 9, 0).toISOString();

    await expect(
      editRecurringSeries(
        fakeDb,
        UID,
        { ...series[1], startAt: farStart, dueAt: farStart },
        horizon,
      ),
    ).rejects.toThrow("생성 가능 기간");

    expect(batch.commit).not.toHaveBeenCalled();
  });
});

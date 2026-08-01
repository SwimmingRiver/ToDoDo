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

const emptyDocsSnapshot: { docs: { id: string; ref: { id: string }; data: () => Record<string, unknown> }[] } = {
  docs: [],
};

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
      .mockResolvedValueOnce(
        toDocSnapshot([root]) as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      ) // 루트 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      ); // 자식 조회(없음)
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
      .mockResolvedValueOnce(
        toDocSnapshot([root]) as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      )
      .mockResolvedValueOnce(
        toDocSnapshot([child1, child2]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(batch.update).toHaveBeenCalledWith({ id: "project-1" }, expect.objectContaining({ archived: true }));
    expect(batch.update).toHaveBeenCalledWith({ id: "child-1" }, expect.objectContaining({ archived: true }));
    expect(batch.update).toHaveBeenCalledWith({ id: "child-2" }, expect.objectContaining({ archived: true }));
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("반복 시리즈 인스턴스(parentId: null)도 별도 처리 없이 루트 규칙을 그대로 적용받아 archived 처리한다", async () => {
    // 반복 시리즈 인스턴스는 항상 parentId: null(루트)로 생성된다(buildRecurringInstanceId).
    // sweepArchivedTodos는 recurrence/recurrenceId 여부를 특별 취급하지 않고 parentId===null
    // 문서를 전부 동일한 루트 쿼리 대상으로 다루므로, done된 지 30일 지난 반복 인스턴스도
    // 일반 단독 투두와 동일하게 archived 처리되어야 한다(스펙 7절).
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const recurringInstance = makeTodo({
      id: "series-1_2026-06-01",
      status: "done",
      doneAt: "2026-06-01T00:00:00.000Z",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "indefinite" },
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        toDocSnapshot([recurringInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      ) // 루트 조회
      .mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      ); // 자식 조회(반복 인스턴스는 자식이 없음)
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(batch.update).toHaveBeenCalledWith(
      { id: "series-1_2026-06-01" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("루트 조회 결과가 없으면(진행 중인 프로젝트뿐이면) batch를 만들지 않는다", async () => {
    // 형제 서브태스크 중 하나가 40일 전 done이어도, 나머지가 진행 중이라 루트 자체가
    // done이 아니면 Firestore 쿼리(status=="done") 조건에 애초에 걸리지 않는다 —
    // 즉 이 케이스는 루트 쿼리가 빈 결과를 반환하는 것으로 자연스럽게 표현된다.
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    expect(writeBatch).not.toHaveBeenCalled();
  });

  it("기본 기준일(30일)로 cutoff를 계산해 doneAt 범위 쿼리에 사용한다", async () => {
    const { getDocs, where } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    // 2026-07-10 기준 30일 전 = 2026-06-10
    expect(where).toHaveBeenCalledWith("doneAt", "<", "2026-06-10T00:00:00.000Z");
  });

  it("cutoffDays 인자를 넘기면 그 기준으로 cutoff를 계산한다", async () => {
    const { getDocs, where } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos(90);

    // 2026-07-10 기준 90일 전 = 2026-04-11
    expect(where).toHaveBeenCalledWith("doneAt", "<", "2026-04-11T00:00:00.000Z");
  });

  it("대상 write 수가 Firestore batch 500 상한을 넘으면 여러 batch로 나눠 commit한다 (루트 200개 x 자식 3개 = 800 write)", async () => {
    // 배포 시점에 이미 30일 넘은 완료 프로젝트가 다수 누적돼 있을 수 있으므로, 단일
    // writeBatch에 전부 몰아넣으면 500 상한을 넘겨 commit() 전체가 실패할 수 있다.
    // 루트+자식을 한 그룹으로 묶어 400(여유를 둔 청크 크기) 단위로 나눠 커밋해야 한다.
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const ROOT_COUNT = 200;
    const CHILDREN_PER_ROOT = 3;
    const roots = Array.from({ length: ROOT_COUNT }, (_, i) =>
      makeTodo({ id: `root-${i}`, status: "done", doneAt: "2026-06-01T00:00:00.000Z" }),
    );
    const childrenByRoot = roots.map((root, i) =>
      Array.from({ length: CHILDREN_PER_ROOT }, (_, j) =>
        makeTodo({ id: `child-${i}-${j}`, parentId: root.id, status: "done" }),
      ),
    );

    let callIndex = 0;
    vi.mocked(getDocs).mockImplementation(async () => {
      const currentCall = callIndex;
      callIndex += 1;
      if (currentCall === 0) {
        return toDocSnapshot(roots) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never;
      }
      const rootIndex = currentCall - 1;
      return toDocSnapshot(childrenByRoot[rootIndex]) as ReturnType<
        typeof getDocs
      > extends Promise<infer T>
        ? T
        : never;
    });

    const batches: ReturnType<typeof makeBatch>[] = [];
    vi.mocked(writeBatch).mockImplementation(() => {
      const b = makeBatch();
      batches.push(b);
      return b as unknown as ReturnType<typeof writeBatch>;
    });

    const { sweepArchivedTodos } = await import("../todoApi");
    await sweepArchivedTodos();

    const totalWrites = ROOT_COUNT * (1 + CHILDREN_PER_ROOT); // 800
    expect(totalWrites).toBeGreaterThan(500);

    // 400(그룹 크기 4의 배수) 단위로 정확히 2개 배치로 나뉘어야 한다.
    expect(batches.length).toBe(2);
    batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));

    const totalUpdateCalls = batches.reduce((sum, b) => sum + b.update.mock.calls.length, 0);
    expect(totalUpdateCalls).toBe(totalWrites);
    expect(batches[0].update.mock.calls.length).toBe(400);
    expect(batches[1].update.mock.calls.length).toBe(400);

    // 그룹(루트+자식) 경계에서 배치가 쪼개지지 않았는지 확인: 한 루트의 자식들은
    // 반드시 그 루트와 같은 배치에 있어야 한다.
    const batchIndexOf = (id: string) =>
      batches.findIndex((b) => b.update.mock.calls.some((call) => (call[0] as { id: string }).id === id));

    expect(batchIndexOf("root-99")).toBe(0);
    expect(batchIndexOf("child-99-0")).toBe(0);
    expect(batchIndexOf("child-99-2")).toBe(0);
    expect(batchIndexOf("root-100")).toBe(1);
    expect(batchIndexOf("child-100-0")).toBe(1);
    expect(batchIndexOf("child-100-2")).toBe(1);
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

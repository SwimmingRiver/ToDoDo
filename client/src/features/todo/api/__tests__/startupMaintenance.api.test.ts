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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-user-id" } },
  googleProvider: {},
}));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

let autoIdCounter = 0;
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
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

import { getDocs, writeBatch } from "firebase/firestore";
import { createPlanTodos } from "../todoApi";

const setupBatch = (existingRootOrders: number[] = [4]) => {
  autoIdCounter = 0;
  const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(writeBatch).mockReset().mockReturnValue(batch as never);
  vi.mocked(getDocs).mockReset().mockResolvedValue({
    docs: existingRootOrders.map((order) => ({ data: () => ({ order }) })),
  } as never);
  return batch;
};

const submission = {
  parent: { title: "이사 준비", dueDate: "2026-10-31", priority: "medium" as const },
  children: [
    { title: "견적 받기", dueDate: "2026-10-03", priority: "high" as const },
    { title: "짐 정리", dueDate: null, priority: "low" as const },
  ],
};

describe("createPlanTodos", () => {
  it("상위 1 + 하위 N을 한 batch로 만들고 한 번만 commit한다", async () => {
    const batch = setupBatch();
    await expect(createPlanTodos(submission)).resolves.toEqual({ parentId: "auto-1", count: 3 });
    expect(batch.set).toHaveBeenCalledTimes(3);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("상위는 다음 루트 order, 하위는 parentId와 0부터의 order를 갖는다", async () => {
    const batch = setupBatch([4, 7]);
    await createPlanTodos(submission);
    const [[parentRef, parent], [, child0], [, child1]] = batch.set.mock.calls;
    expect(parentRef).toEqual({ id: "auto-1" });
    expect(parent).toMatchObject({ title: "이사 준비", parentId: null, order: 8, priority: "medium" });
    expect(child0).toMatchObject({ title: "견적 받기", parentId: "auto-1", order: 0, priority: "high" });
    expect(child1).toMatchObject({ title: "짐 정리", parentId: "auto-1", order: 1, priority: "low" });
  });

  it("공통 필드: todo 상태, 반복 없음, 보관 아님, userId, startAt·doneAt null", async () => {
    const batch = setupBatch();
    await createPlanTodos(submission);
    for (const [, data] of batch.set.mock.calls) {
      expect(data).toMatchObject({
        userId: "test-user-id",
        status: "todo",
        startAt: null,
        doneAt: null,
        recurrence: null,
        recurrenceId: null,
        archived: false,
      });
      expect(data.createdAt).toBe(data.updatedAt);
    }
  });

  it("날짜 키는 로컬 자정의 UTC ISO로 저장한다", async () => {
    const batch = setupBatch();
    await createPlanTodos(submission);
    const [[, parent], [, child0], [, child1]] = batch.set.mock.calls;
    expect(parent.dueAt).toBe(new Date(2026, 9, 31).toISOString());
    expect(child0.dueAt).toBe(new Date(2026, 9, 3).toISOString());
    expect(child1.dueAt).toBeNull();
  });

  it("하위가 0개면 아무것도 쓰지 않고 던진다", async () => {
    const batch = setupBatch();
    await expect(createPlanTodos({ ...submission, children: [] })).rejects.toThrow();
    expect(batch.commit).not.toHaveBeenCalled();
  });
});

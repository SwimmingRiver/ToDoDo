import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Todo, RecurrenceRule } from "../../types/todo.type";

// 9f659ea(반복 할 일 호라이즌 데이터 손실 방지 및 정합성 개선) 회귀 테스트.
// 세 가지 데이터 정합성 수정이 리팩토링 과정에서 조용히 되돌아가는 것을 막는다:
//  1) 호라이즌 초과 시 명시적 에러 — 조용히 0개 커밋(생성)하거나 기존 미래 인스턴스를
//     삭제만 하고 재생성 없이 끝나는(수정) 데이터 손실 방지
//  2) deleteTodo 연쇄 삭제 — 루트 삭제 시 하위 고아 문서 방지, 하위 삭제 시 부모 상태 재계산
//  3) editTodo batch 원자성 — 상위/하위 상태 동기화 쓰기가 부분 실패로 어긋나지 않도록
//     Promise.all(updateDoc...)이 아닌 단일 batch로 커밋
// 검증 방법: 이 파일은 9f659ea 직전 코드(todoApi.ts)로 바꿔 실행하면 실패해야 한다
// (2026-07-11 작성 시점에 실제로 확인함).

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

// recurringTodoApi.test.ts와 동일한 이유: once 큐 leak 방지를 위해 매 테스트 완전 리셋
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

type GetDocsResult = ReturnType<typeof import("firebase/firestore").getDocs> extends Promise<
  infer T
>
  ? T
  : never;

describe("호라이즌 초과 시 명시적 에러 (조용한 데이터 손실 방지)", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("createRecurringTodo: 시작일이 호라이즌 밖이면 조용히 0개 생성하지 않고 에러를 던진다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValue(emptyDocsSnapshot as GetDocsResult);
    vi.mocked(writeBatch).mockReturnValue(
      makeBatch() as unknown as ReturnType<typeof writeBatch>,
    );

    const { createRecurringTodo } = await import("../todoApi");

    const todo = makeTodo({
      startAt: "2026-09-01T09:00:00", // 호라이즌(7/20) 밖
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-20T00:00:00");

    // 수정 전 코드는 빈 배열로 resolve해 사용자가 일정이 생겼다고 착각하게 만들었다.
    await expect(createRecurringTodo(todo, horizonEnd)).rejects.toThrow(
      "반복 생성 가능 기간",
    );
    // 빈 batch 커밋("성공한 것처럼 보임")도 없어야 한다.
    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
  });

  it("editRecurringSeries: 새 마감일이 호라이즌 밖이면 에러를 던지고 커밋하지 않아 기존 미래 인스턴스가 보존된다", async () => {
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
      .mockResolvedValueOnce(toDocSnapshot([futureInstance]) as GetDocsResult)
      .mockResolvedValue(emptyDocsSnapshot as GetDocsResult);
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editRecurringSeries } = await import("../todoApi");

    // 새 시작일을 호라이즌(now+10일) 밖(now+30일)으로 옮기는 수정 시도
    const beyondHorizonIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: beyondHorizonIso,
      dueAt: beyondHorizonIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10);

    await expect(editRecurringSeries(seriesTodo, horizonEnd)).rejects.toThrow(
      "반복 생성 가능 기간",
    );
    // 수정 전 코드는 미래 인스턴스 삭제만 스테이징된 batch를 그대로 커밋해
    // 시리즈의 미래 일정이 통째로 소실됐다. commit이 없어야 삭제가 취소된다.
    expect(batch.commit).not.toHaveBeenCalled();
  });
});

describe("deleteTodo 연쇄 삭제 (고아 문서/부모 상태 정합성)", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("루트 삭제 시 하위 할 일도 같은 batch에서 함께 삭제한다 (고아 문서 방지)", async () => {
    const { getDoc, getDocs, writeBatch } = await import("firebase/firestore");

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: "test-user-id", parentId: null }),
    } as unknown as Awaited<ReturnType<typeof getDoc>>);

    const children = [
      makeTodo({ id: "child-1", parentId: "root-1" }),
      makeTodo({ id: "child-2", parentId: "root-1" }),
    ];
    vi.mocked(getDocs).mockResolvedValueOnce(toDocSnapshot(children) as GetDocsResult);

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { deleteTodo } = await import("../todoApi");

    await deleteTodo("root-1");

    // 루트 1건 + 하위 2건 = 3건이 하나의 batch에서 삭제되어야 한다.
    // 수정 전 코드는 루트만 deleteDoc으로 지워 하위 2건이 고아로 남았다.
    expect(batch.delete).toHaveBeenCalledTimes(3);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("하위 삭제 시 남은 형제 기준으로 부모 상태를 같은 batch에서 재계산한다", async () => {
    const { getDoc, getDocs, writeBatch } = await import("firebase/firestore");

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: "test-user-id", parentId: "parent-1" }),
    } as unknown as Awaited<ReturnType<typeof getDoc>>);

    // 삭제 대상(todo)과 남을 형제(done) — 삭제 후 남은 형제가 전부 done이므로 부모도 done
    const siblings = [
      makeTodo({ id: "child-1", parentId: "parent-1", status: "todo" }),
      makeTodo({ id: "child-2", parentId: "parent-1", status: "done" }),
    ];
    vi.mocked(getDocs).mockResolvedValueOnce(toDocSnapshot(siblings) as GetDocsResult);

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { deleteTodo } = await import("../todoApi");

    await deleteTodo("child-1");

    // 수정 전 코드는 부모 상태를 재계산하지 않아, 마지막 미완료 하위를 지워도
    // 부모가 todo/doing에 머물렀다.
    expect(batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "parent-1" }),
      expect.objectContaining({ status: "done" }),
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("마지막 하위를 삭제해 남은 형제가 0명이면 부모 상태를 건드리지 않는다 (빈 배열 every()의 무조건 done 부작용 방지)", async () => {
    const { getDoc, getDocs, writeBatch } = await import("firebase/firestore");

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: "test-user-id", parentId: "parent-1" }),
    } as unknown as Awaited<ReturnType<typeof getDoc>>);

    // 시리즈에 자기 자신만 존재 — 삭제 후 형제 0명
    const siblings = [makeTodo({ id: "child-1", parentId: "parent-1", status: "todo" })];
    vi.mocked(getDocs).mockResolvedValueOnce(toDocSnapshot(siblings) as GetDocsResult);

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { deleteTodo } = await import("../todoApi");

    await deleteTodo("child-1");

    // calcParentStatus([])는 every()의 빈 배열 특성상 무조건 "done"을 반환하므로,
    // 형제가 0명일 때 부모 업데이트가 실행되면 미완료 부모가 완료로 둔갑한다.
    expect(batch.update).not.toHaveBeenCalled();
    expect(batch.delete).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("editTodo batch 원자성 (상위/하위 상태 동기화)", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("상위 done 처리 시 본인+하위 쓰기가 개별 updateDoc이 아니라 단일 batch 커밋으로 실행된다", async () => {
    const { getDoc, updateDoc, writeBatch } = await import("firebase/firestore");

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: "test-user-id" }),
    } as unknown as Awaited<ReturnType<typeof getDoc>>);

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { editTodo } = await import("../todoApi");

    const root = makeTodo({ id: "root-1", status: "done" });
    const allTodos = [
      root,
      makeTodo({ id: "child-1", parentId: "root-1", status: "todo" }),
      makeTodo({ id: "child-2", parentId: "root-1", status: "doing" }),
    ];

    await editTodo(root, allTodos);

    // 수정 전 코드는 Promise.all(updateDoc×3)로 병렬 쓰기해, 일부만 성공하면
    // 상위는 done인데 하위는 todo인 어긋난 상태가 남을 수 있었다.
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    expect(batch.update).toHaveBeenCalledTimes(3); // 본인 + 하위 2건
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

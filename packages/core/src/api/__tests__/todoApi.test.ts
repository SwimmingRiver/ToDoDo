import { describe, it, expect, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import type { Todo } from "../../types/todo";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

const fakeDb = {} as Firestore;

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "u1",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("todoApi", () => {
  it("getTodos는 order 순으로 정렬해서 반환한다", async () => {
    const { getDocs } = await import("firebase/firestore");
    const { getTodos } = await import("../todoApi");

    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: "todo-2", data: () => ({ userId: "u1", title: "b", order: 1 }) },
        { id: "todo-1", data: () => ({ userId: "u1", title: "a", order: 0 }) },
      ],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const result = await getTodos(fakeDb, "u1");

    expect(result.map((t) => t.id)).toEqual(["todo-1", "todo-2"]);
  });

  it("fetchAllUserTodos는 archived 조건 없이 userId로만 조회한다", async () => {
    const { getDocs, where } = await import("firebase/firestore");
    const { fetchAllUserTodos } = await import("../todoApi");
    vi.mocked(where).mockClear();

    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: "todo-1", data: () => ({ userId: "u1", title: "a", archived: true }) },
        { id: "todo-2", data: () => ({ userId: "u1", title: "b", archived: false }) },
      ],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const result = await fetchAllUserTodos(fakeDb, "u1");

    expect(result).toHaveLength(2);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith("userId", "==", "u1");
  });

  it("createTodo는 status/doneAt/timestamps를 채워서 저장하고 생성된 id를 반환한다", async () => {
    const { addDoc } = await import("firebase/firestore");
    const { createTodo } = await import("../todoApi");

    vi.mocked(addDoc).mockResolvedValueOnce({ id: "new-id" } as Awaited<
      ReturnType<typeof addDoc>
    >);

    const id = await createTodo(fakeDb, "u1", {
      title: "새 할 일",
      priority: "medium",
      startAt: null,
      dueAt: null,
      parentId: null,
      order: 0,
    });

    expect(id).toBe("new-id");
    const [, payload] = vi.mocked(addDoc).mock.calls[0];
    expect(payload).toMatchObject({
      userId: "u1",
      title: "새 할 일",
      status: "todo",
      doneAt: null,
      archived: false,
    });
  });

  it("updateTodo는 updatedAt을 갱신해서 저장한다", async () => {
    const { writeBatch, doc } = await import("firebase/firestore");
    const { updateTodo } = await import("../todoApi");

    vi.mocked(doc).mockImplementation((_db, _coll, id) => ({ id }) as never);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    const allTodos = [makeTodo({ id: "todo-1", parentId: null })];

    await updateTodo(
      fakeDb,
      "todo-1",
      { status: "done", doneAt: "2026-08-20T00:00:00.000Z" },
      allTodos,
    );

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const [ref, payload] = batchUpdate.mock.calls[0];
    expect(ref).toEqual({ id: "todo-1" });
    expect(payload).toMatchObject({ status: "done", doneAt: "2026-08-20T00:00:00.000Z" });
    expect(payload).toHaveProperty("updatedAt");
    expect(batchCommit).toHaveBeenCalled();
  });

  it("updateTodo가 status를 done으로 바꾸면 자식들도 함께 done으로 배치 갱신한다", async () => {
    const { writeBatch, doc } = await import("firebase/firestore");
    const { updateTodo } = await import("../todoApi");

    vi.mocked(doc).mockImplementation((_db, _coll, id) => ({ id }) as never);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    const allTodos = [
      makeTodo({ id: "root-1", parentId: null, status: "doing" }),
      makeTodo({ id: "child-1", parentId: "root-1", status: "todo" }),
      makeTodo({ id: "child-2", parentId: "root-1", status: "doing" }),
    ];

    await updateTodo(
      fakeDb,
      "root-1",
      { status: "done", doneAt: "2026-08-23T00:00:00.000Z" },
      allTodos,
    );

    expect(batchUpdate).toHaveBeenCalledTimes(3);
    const updatesById = Object.fromEntries(
      batchUpdate.mock.calls.map(([ref, payload]) => [(ref as { id: string }).id, payload]),
    );
    expect(updatesById["root-1"]).toMatchObject({ status: "done" });
    expect(updatesById["child-1"]).toMatchObject({ status: "done" });
    expect(updatesById["child-1"].doneAt).toEqual(expect.any(String));
    expect(updatesById["child-2"]).toMatchObject({ status: "done" });
    expect(updatesById["child-2"].doneAt).toEqual(expect.any(String));
    expect(batchCommit).toHaveBeenCalled();
  });

  it("updateTodo가 자식 상태를 바꾸면 형제들을 기준으로 부모 상태를 재계산해 함께 갱신한다", async () => {
    const { writeBatch, doc } = await import("firebase/firestore");
    const { updateTodo } = await import("../todoApi");

    vi.mocked(doc).mockImplementation((_db, _coll, id) => ({ id }) as never);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    const allTodos = [
      makeTodo({ id: "root-1", parentId: null, status: "todo" }),
      makeTodo({ id: "child-1", parentId: "root-1", status: "todo" }),
      makeTodo({ id: "child-2", parentId: "root-1", status: "done" }),
    ];

    await updateTodo(fakeDb, "child-1", { status: "doing" }, allTodos);

    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const updatesById = Object.fromEntries(
      batchUpdate.mock.calls.map(([ref, payload]) => [(ref as { id: string }).id, payload]),
    );
    expect(updatesById["child-1"]).toMatchObject({ status: "doing" });
    expect(updatesById["root-1"]).toMatchObject({ status: "doing", doneAt: null });
    expect(batchCommit).toHaveBeenCalled();
  });

  it("updateTodo가 새 parentId(재부모 지정)를 받으면 옛 부모가 아니라 새 부모를 기준으로 재계산한다", async () => {
    const { writeBatch, doc } = await import("firebase/firestore");
    const { updateTodo } = await import("../todoApi");

    vi.mocked(doc).mockImplementation((_db, _coll, id) => ({ id }) as never);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    const allTodos = [
      makeTodo({ id: "old-root", parentId: null, status: "todo" }),
      makeTodo({ id: "old-root-child", parentId: "old-root", status: "todo" }),
      makeTodo({ id: "new-root", parentId: null, status: "todo" }),
      makeTodo({ id: "new-root-child", parentId: "new-root", status: "todo" }),
      makeTodo({ id: "child-1", parentId: "old-root", status: "todo" }),
    ];

    // child-1을 old-root에서 new-root로 옮기면서 done으로 표시한다.
    await updateTodo(fakeDb, "child-1", { parentId: "new-root", status: "done" }, allTodos);

    const updatesById = Object.fromEntries(
      batchUpdate.mock.calls.map(([ref, payload]) => [(ref as { id: string }).id, payload]),
    );
    // new-root는 new-root-child(todo)와 새로 들어온 child-1(done)을 형제로 가지므로 doing이어야 한다.
    expect(updatesById["new-root"]).toMatchObject({ status: "doing", doneAt: null });
    // old-root는 더 이상 child-1의 부모가 아니므로 재계산 대상이 아니다.
    expect(updatesById["old-root"]).toBeUndefined();
  });

  it("deleteTodo는 하위 할 일이 없으면 대상 문서만 삭제한다", async () => {
    const { getDocs, writeBatch, doc } = await import("firebase/firestore");
    const { deleteTodo } = await import("../todoApi");

    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const batchDelete = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      delete: batchDelete,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    await deleteTodo(fakeDb, "u1", "todo-1");

    expect(doc).toHaveBeenCalledWith(fakeDb, "todos", "todo-1");
    expect(batchDelete).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalled();
  });

  it("deleteTodo는 하위 할 일이 있으면 함께 삭제해 고아 문서를 남기지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const { deleteTodo } = await import("../todoApi");

    const childRefs = [{ id: "child-1" }, { id: "child-2" }];
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: childRefs.map((ref) => ({ ref })),
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const batchDelete = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({
      delete: batchDelete,
      commit: batchCommit,
    } as unknown as ReturnType<typeof writeBatch>);

    await deleteTodo(fakeDb, "u1", "root-1");

    // 대상 문서 1개 + 하위 할 일 2개 = 총 3번의 batch.delete 호출
    expect(batchDelete).toHaveBeenCalledTimes(3);
    expect(batchDelete).toHaveBeenCalledWith(childRefs[0]);
    expect(batchDelete).toHaveBeenCalledWith(childRefs[1]);
    expect(batchCommit).toHaveBeenCalled();
  });

  // firestore.rules의 read는 resource.data.userId == auth.uid라서, userId 조건이 없는
  // 쿼리는 결과가 0건이어도 규칙이 통째로 거부한다(permission-denied). 에뮬레이터에서
  // userId 조건 없이 parentId만으로 조회하면 하위 할 일이 없는 삭제까지 실패했다.
  it("deleteTodo는 하위 할 일을 userId 조건과 함께 조회해 보안 규칙을 통과한다", async () => {
    const { getDocs, writeBatch, where } = await import("firebase/firestore");
    const { deleteTodo } = await import("../todoApi");

    vi.mocked(where).mockClear();
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    vi.mocked(writeBatch).mockReturnValue({
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof writeBatch>);

    await deleteTodo(fakeDb, "u1", "root-1");

    expect(where).toHaveBeenCalledWith("userId", "==", "u1");
    expect(where).toHaveBeenCalledWith("parentId", "==", "root-1");
  });
});

describe("calcParentStatus", () => {
  it("형제가 전부 done이면 done을 반환한다", async () => {
    const { calcParentStatus } = await import("../todoApi");

    const result = calcParentStatus([
      makeTodo({ id: "a", status: "done" }),
      makeTodo({ id: "b", status: "done" }),
    ]);

    expect(result.status).toBe("done");
    expect(result.doneAt).toEqual(expect.any(String));
  });

  it("형제 중 doing이나 done이 하나라도 있으면 doing을 반환하고 doneAt은 null이다", async () => {
    const { calcParentStatus } = await import("../todoApi");

    expect(calcParentStatus([makeTodo({ status: "todo" }), makeTodo({ status: "doing" })])).toEqual({
      status: "doing",
      doneAt: null,
    });
    expect(calcParentStatus([makeTodo({ status: "todo" }), makeTodo({ status: "done" })])).toEqual({
      status: "doing",
      doneAt: null,
    });
  });

  it("형제가 전부 todo면 todo를 반환한다", async () => {
    const { calcParentStatus } = await import("../todoApi");

    expect(calcParentStatus([makeTodo({ status: "todo" }), makeTodo({ status: "todo" })])).toEqual({
      status: "todo",
      doneAt: null,
    });
  });
});

import { describe, it, expect, vi } from "vitest";
vi.mock("firebase/firestore", () => ({
    collection: vi.fn(() => ({})),
    addDoc: vi.fn(),
    getDocs: vi.fn(),
    doc: vi.fn(() => ({})),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
}));
const fakeDb = {};
describe("todoApi", () => {
    it("getTodos는 order 순으로 정렬해서 반환한다", async () => {
        const { getDocs } = await import("firebase/firestore");
        const { getTodos } = await import("../todoApi");
        vi.mocked(getDocs).mockResolvedValueOnce({
            docs: [
                { id: "todo-2", data: () => ({ userId: "u1", title: "b", order: 1 }) },
                { id: "todo-1", data: () => ({ userId: "u1", title: "a", order: 0 }) },
            ],
        });
        const result = await getTodos(fakeDb, "u1");
        expect(result.map((t) => t.id)).toEqual(["todo-1", "todo-2"]);
    });
    it("createTodo는 status/doneAt/timestamps를 채워서 저장하고 생성된 id를 반환한다", async () => {
        const { addDoc } = await import("firebase/firestore");
        const { createTodo } = await import("../todoApi");
        vi.mocked(addDoc).mockResolvedValueOnce({ id: "new-id" });
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
        const { updateDoc } = await import("firebase/firestore");
        const { updateTodo } = await import("../todoApi");
        await updateTodo(fakeDb, "todo-1", { status: "done", doneAt: "2026-08-20T00:00:00.000Z" });
        const [, payload] = vi.mocked(updateDoc).mock.calls[0];
        expect(payload).toMatchObject({ status: "done", doneAt: "2026-08-20T00:00:00.000Z" });
        expect(payload).toHaveProperty("updatedAt");
    });
    it("deleteTodo는 해당 문서를 삭제한다", async () => {
        const { deleteDoc, doc } = await import("firebase/firestore");
        const { deleteTodo } = await import("../todoApi");
        await deleteTodo(fakeDb, "todo-1");
        expect(doc).toHaveBeenCalledWith(fakeDb, "todos", "todo-1");
        expect(deleteDoc).toHaveBeenCalled();
    });
});

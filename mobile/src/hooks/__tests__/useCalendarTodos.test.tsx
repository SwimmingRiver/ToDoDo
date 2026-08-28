import { renderHook } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";

const mockUseTodos = jest.fn();
jest.mock("../useTodos", () => ({ useTodos: () => mockUseTodos() }));

const mockUpdateMutate = jest.fn();
jest.mock("../useUpdateTodo", () => ({ useUpdateTodo: () => ({ mutate: mockUpdateMutate }) }));

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: "id",
  userId: "u1",
  title: "title",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("useCalendarTodos", () => {
  it("markedDates를 buildCalendarMarkedDates로 계산해 반환한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [makeTodo({ id: "a", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "doing" })],
      isLoading: false,
      isError: false,
    });

    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    expect(Object.keys(result.current.markedDates)).toEqual(["2026-06-20"]);
  });

  it("getTodosForDate는 isDateInTodoRange로 그 날짜의 항목만 반환한다(완료 포함)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "a", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "b", dueAt: new Date(2026, 5, 20, 9).toISOString(), status: "done" }),
        makeTodo({ id: "c", dueAt: new Date(2026, 5, 21, 9).toISOString(), status: "todo" }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    expect(result.current.getTodosForDate("2026-06-20").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("toggleDone은 완료↔미완료 상태와 doneAt을 함께 갱신하도록 mutate를 호출한다", async () => {
    mockUseTodos.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());

    const todo = makeTodo({ id: "a", status: "todo", title: "제목" });
    result.current.toggleDone(todo);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: "a",
      fields: { status: "done", doneAt: expect.any(String) },
      title: "제목",
    });
  });

  it("isLoading/isError를 useTodos()에서 그대로 전달한다", async () => {
    mockUseTodos.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { useCalendarTodos } = await import("../useCalendarTodos");
    const { result } = await renderHook(() => useCalendarTodos());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.getTodosForDate("2026-06-20")).toEqual([]);
  });
});

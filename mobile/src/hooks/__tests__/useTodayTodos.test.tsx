import { renderHook } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
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

describe("useTodayTodos", () => {
  // @testing-library/react-native@14의 renderHook()도 render()와 마찬가지로
  // async 함수다 — 반드시 await한다(result.current를 즉시 읽으면 아직 준비 전).
  //
  // getDaysLeft(due.ts)가 실제 시스템 시각(new Date())을 기준으로 삼으므로,
  // "2026-06-16 dueAt은 danger가 아니어야 한다" 같은 마커 판정이 실행 시점의
  // 실제 날짜에 좌우되지 않도록 반드시 고정한다.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("선택 날짜에 해당하는 항목만 진행중/완료로 분리한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "a", dueAt: new Date(2026, 5, 15, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "b", dueAt: new Date(2026, 5, 15, 9).toISOString(), status: "done", doneAt: "2026-06-15T01:00:00.000Z" }),
        makeTodo({ id: "c", dueAt: new Date(2026, 5, 16, 9).toISOString() }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useTodayTodos } = await import("../useTodayTodos");
    const { result } = await renderHook(() => useTodayTodos("2026-06-15", "2026-06-15"));

    expect(result.current.inProgressTodos.map((t) => t.id)).toEqual(["a"]);
    expect(result.current.doneTodos.map((t) => t.id)).toEqual(["b"]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.doneCount).toBe(1);
  });

  it("dueAt 기준 마커를 계산한다(range 확장 안 함)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        makeTodo({ id: "danger", dueAt: new Date(2026, 5, 10, 9).toISOString(), status: "todo" }),
        makeTodo({ id: "normal", dueAt: new Date(2026, 5, 16, 9).toISOString(), status: "todo" }),
      ],
      isLoading: false,
      isError: false,
    });

    const { useTodayTodos } = await import("../useTodayTodos");
    // windowStart는 "2026-06-10"이어야 아래에서 검사하는 06-10/06-12/06-16이
    // 모두 7일 스트립(06-10~06-16) 범위 안에 든다. selectedDate("2026-06-15")와
    // 동일한 값을 넘기면 스트립이 06-15~06-21이 되어 06-10/06-12 키가 아예
    // 생성되지 않는다(웹 참조 구현 client/src/features/today/hooks/useTodayTodos.ts와
    // 그 테스트가 windowStart 밖 키는 undefined임을 명시적으로 검증함).
    const { result } = await renderHook(() => useTodayTodos("2026-06-15", "2026-06-10"));

    expect(result.current.markers["2026-06-10"]).toBe("danger");
    expect(result.current.markers["2026-06-16"]).toBe("normal");
    expect(result.current.markers["2026-06-12"]).toBe("none");
  });

  it("toggleDone은 완료↔미완료 상태와 doneAt을 함께 갱신하도록 mutate를 호출한다", async () => {
    mockUseTodos.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { useTodayTodos } = await import("../useTodayTodos");
    const { result } = await renderHook(() => useTodayTodos("2026-06-15", "2026-06-15"));

    const todo = makeTodo({ id: "a", status: "todo", title: "제목" });
    result.current.toggleDone(todo);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: "a",
      fields: { status: "done", doneAt: expect.any(String) },
      title: "제목",
    });
  });
});

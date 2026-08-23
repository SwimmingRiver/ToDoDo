import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockDeleteTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useDeleteTodo", () => ({
  useDeleteTodo: () => ({ mutateAsync: mockDeleteTodoMutateAsync }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

describe("TodoListScreen", () => {
  beforeEach(() => {
    mockDeleteTodoMutateAsync.mockReset();
  });

  it("루트와 하위 할 일 제목을 모두 렌더링한다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        { id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", order: 0 },
        { id: "todo-2", title: "하위 할 일", parentId: "todo-1", status: "todo", order: 0 },
      ],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("루트 할 일")).toBeTruthy();
    expect(screen.getByText("하위 할 일")).toBeTruthy();
  });

  it("하위 할 일의 order 값이 다른 루트의 order 값과 겹쳐도, 실제 부모 바로 아래에 묶여서 렌더링된다", async () => {
    // 루트 A(order 0), 루트 B(order 1), B의 자식 E(order 0) — order만으로 전역 정렬하면
    // A, E, B 순서가 되어 E가 B가 아니라 A의 자식처럼 보인다. 실제로는 A, B, E 순서여야 한다.
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        { id: "root-a", title: "루트 A", parentId: null, status: "todo", order: 0 },
        { id: "child-e", title: "자식 E", parentId: "root-b", status: "todo", order: 0 },
        { id: "root-b", title: "루트 B", parentId: null, status: "todo", order: 1 },
      ],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    const rows = screen.getAllByTestId(/^todo-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      "todo-row-root-a",
      "todo-row-root-b",
      "todo-row-child-e",
    ]);
  });

  it("목록 조회에 실패하면 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });

  it("삭제에 실패하면 해당 항목에 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", order: 0 }],
    });
    mockDeleteTodoMutateAsync.mockRejectedValue(new Error("네트워크 오류"));

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    await fireEvent.press(screen.getByText("삭제"));

    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Alert } from "react-native";

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockDeleteTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useDeleteTodo", () => ({
  useDeleteTodo: () => ({ mutateAsync: mockDeleteTodoMutateAsync }),
}));

const mockUpdateTodoMutate = jest.fn();
let mockUpdateTodoIsPending = false;
jest.mock("../../hooks/useUpdateTodo", () => ({
  useUpdateTodo: () => ({ mutate: mockUpdateTodoMutate, isPending: mockUpdateTodoIsPending }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

type AlertButton = { text: string; style?: string; onPress?: () => void };

// Alert.alert는 네이티브 모듈이라 테스트 환경에서는 실제 다이얼로그를 띄우지 않는다.
// "확인" 버튼(style: destructive)의 onPress를 직접 호출해 사용자가 삭제를 확정한
// 상황을 재현한다.
const confirmAlertDelete = async () => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [
    string,
    string,
    AlertButton[],
  ];
  const destructive = call[2].find((button) => button.style === "destructive");
  await destructive?.onPress?.();
};

describe("TodoListScreen", () => {
  beforeEach(() => {
    mockDeleteTodoMutateAsync.mockReset();
    mockUpdateTodoMutate.mockReset();
    mockUpdateTodoIsPending = false;
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("루트와 하위 할 일 제목을 모두 렌더링한다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        { id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 },
        { id: "todo-2", title: "하위 할 일", parentId: "todo-1", status: "todo", priority: "medium", order: 0 },
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
        { id: "root-a", title: "루트 A", parentId: null, status: "todo", priority: "medium", order: 0 },
        { id: "child-e", title: "자식 E", parentId: "root-b", status: "todo", priority: "medium", order: 0 },
        { id: "root-b", title: "루트 B", parentId: null, status: "todo", priority: "medium", order: 1 },
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

  it("삭제 버튼을 누르면 확인 다이얼로그를 띄우고, 확인 전에는 삭제 요청을 보내지 않는다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("할 일 삭제"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
  });

  it("확인 다이얼로그에서 삭제를 확정하면 실제로 삭제 요청을 보낸다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("할 일 삭제"));
    await confirmAlertDelete();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("todo-1");
  });

  it("삭제에 실패하면 해당 항목에 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });
    mockDeleteTodoMutateAsync.mockRejectedValue(new Error("네트워크 오류"));

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("할 일 삭제"));
    await confirmAlertDelete();

    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
  });

  // 의사결정 확정 2번(design/spec.md): 탭-사이클 대신 웹과 동일한 "탭→바텀시트 3택".
  // 상태 칩을 누르면 바텀시트가 열리고, 옵션을 선택해야만 mutate가 호출된다.
  it("상태 칩을 누르면 상태 선택 바텀시트가 열린다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.queryByText("상태 선택")).toBeNull();

    fireEvent.press(screen.getByTestId("status-toggle-todo-1"));

    // RN Modal의 jest 목(mock)은 visible prop이 false→true로 바뀔 때 내부
    // componentDidUpdate가 한 번 더 setState를 거쳐야 렌더링되어, press 직후
    // 동기 조회로는 아직 못 찾는다. waitFor로 다음 틱까지 기다린다.
    await waitFor(() => {
      expect(screen.getByText("상태 선택")).toBeTruthy();
    });
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
  });

  it("바텀시트에서 '진행 중'을 선택하면 useUpdateTodo가 해당 상태로 호출된다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-toggle-todo-1"));
    fireEvent.press(await screen.findByText("진행 중"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "todo-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("바텀시트에서 '완료'를 선택하면 doneAt이 현재 시간으로 설정된다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "doing", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-toggle-todo-1"));
    fireEvent.press(await screen.findByText("완료"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "todo-1",
      fields: { status: "done", doneAt: expect.any(String) },
    });
  });

  it("바텀시트에서 '할 일'을 선택하면 doneAt이 null로 설정된다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "done", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-toggle-todo-1"));
    fireEvent.press(await screen.findByText("할 일"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "todo-1",
      fields: { status: "todo", doneAt: null },
    });
  });

  it("이전 상태 변경이 진행 중이면 상태 칩을 눌러도 바텀시트가 열리지 않는다(더블탭 방지)", async () => {
    mockUpdateTodoIsPending = true;
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: "todo-1", title: "루트 할 일", parentId: null, status: "todo", priority: "medium", order: 0 }],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-toggle-todo-1"));

    expect(screen.queryByText("상태 선택")).toBeNull();
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
  });

  // 의사결정 확정(design/spec.md "우선순위" 절): "높음"만 제목 앞에 "!" 표시로 강조하고,
  // 보통/낮음은 별도 표시가 없다(기존 한글 라벨 plain text는 제거).
  it("우선순위가 높음인 항목만 제목 앞에 '!' 표시가 붙는다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        { id: "todo-1", title: "낮음 할 일", parentId: null, status: "todo", priority: "low", order: 0 },
        { id: "todo-2", title: "보통 할 일", parentId: null, status: "todo", priority: "medium", order: 1 },
        { id: "todo-3", title: "높음 할 일", parentId: null, status: "todo", priority: "high", order: 2 },
      ],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("낮음 할 일")).toBeTruthy();
    expect(screen.getByText("보통 할 일")).toBeTruthy();
    expect(screen.queryByText("낮음")).toBeNull();
    expect(screen.queryByText("보통")).toBeNull();
    expect(screen.getByText("!", { exact: false })).toBeTruthy();
  });
});

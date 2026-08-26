import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockUpdateTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useUpdateTodo", () => ({
  useUpdateTodo: () => ({ mutateAsync: mockUpdateTodoMutateAsync, isPending: false }),
}));

const mockDeleteTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useDeleteTodo", () => ({
  useDeleteTodo: () => ({ mutateAsync: mockDeleteTodoMutateAsync }),
}));

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockRouteParams: { id: string } = { id: "root-1" };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const rootTodo = (overrides: Record<string, unknown> = {}) => ({
  id: "root-1",
  title: "루트 할 일",
  description: "설명입니다",
  parentId: null,
  status: "todo",
  priority: "medium",
  order: 0,
  startAt: null,
  dueAt: null,
  doneAt: null,
  recurrenceId: null,
  recurrence: null,
  ...overrides,
});

describe("TodoDetailScreen", () => {
  beforeEach(() => {
    mockUpdateTodoMutateAsync.mockReset();
    mockDeleteTodoMutateAsync.mockReset();
    mockGoBack.mockReset();
    mockNavigate.mockReset();
    mockRouteParams = { id: "root-1" };
  });

  it("route id에 해당하는 할 일이 캐시에 없으면 안내 문구를 보여준다", async () => {
    mockUseTodos.mockReturnValue({ data: [] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("할 일을 찾을 수 없습니다")).toBeTruthy();
  });

  it("기존 제목/설명/우선순위 값으로 폼이 채워진다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo({ priority: "high" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByDisplayValue("루트 할 일")).toBeTruthy();
    expect(screen.getByDisplayValue("설명입니다")).toBeTruthy();
    expect(screen.getByLabelText("우선순위 높음").props.accessibilityState.selected).toBe(true);
  });

  it("저장을 누르면 수정된 필드로 useUpdateTodo를 호출하고 뒤로 간다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo()] });
    mockUpdateTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.changeText(screen.getByDisplayValue("루트 할 일"), "수정된 제목");
    await screen.findByDisplayValue("수정된 제목");

    await act(async () => {
      fireEvent.press(screen.getByText("저장"));
    });

    expect(mockUpdateTodoMutateAsync).toHaveBeenCalledWith({
      id: "root-1",
      fields: {
        title: "수정된 제목",
        description: "설명입니다",
        priority: "medium",
        startAt: null,
        dueAt: null,
      },
      title: "수정된 제목",
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("시작일시가 마감일시보다 늦으면 저장하지 않고 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo({
          startAt: "2026-01-02T00:00:00.000Z",
          dueAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("저장"));
    });

    expect(
      await screen.findByText("시작일시는 마감일시보다 늦을 수 없습니다"),
    ).toBeTruthy();
    expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
  });

  it("상태 배지를 누르면 바텀시트가 열리고, 선택하면 useUpdateTodo가 상태로 호출된다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo({ status: "todo" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("detail-status-badge"));
    fireEvent.press(await screen.findByText("진행 중"));

    expect(mockUpdateTodoMutateAsync).toHaveBeenCalledWith({
      id: "root-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("삭제 버튼을 누르면 확인 다이얼로그를 띄우고, 확정하면 삭제 후 뒤로 간다", async () => {
    const { Alert } = require("react-native");
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseTodos.mockReturnValue({ data: [rootTodo()] });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByText("삭제"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "프로젝트 삭제",
      expect.any(String),
      expect.any(Array),
    );

    const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [
      string,
      string,
      { text: string; style?: string; onPress?: () => void }[],
    ];
    const destructive = call[2].find((button) => button.style === "destructive");
    await destructive?.onPress?.();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("root-1");
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("루트(parentId 없음)일 때만 하위 할 일 섹션이 보이고, 추가 버튼은 TodoForm으로 parentId와 함께 이동한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1", status: "done" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("하위 항목")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("하위 할 일 추가"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { parentId: "root-1" });
  });

  it("자식(parentId 있음) 상세에서는 하위 할 일 섹션이 보이지 않는다", async () => {
    mockRouteParams = { id: "child-1" };
    mockUseTodos.mockReturnValue({
      data: [rootTodo(), rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" })],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.queryByLabelText("하위 할 일 추가")).toBeNull();
  });

  it("반복 할 일이면 읽기 전용 반복 배지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      data: [rootTodo({ recurrenceId: "series-1" })],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("반복")).toBeTruthy();
  });
});

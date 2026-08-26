import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockUpdateTodoMutateAsync = jest.fn<() => Promise<void>>();
const mockUpdateTodoMutate = jest.fn();
let mockUpdateTodoIsPending = false;
jest.mock("../../hooks/useUpdateTodo", () => ({
  useUpdateTodo: () => ({
    mutateAsync: mockUpdateTodoMutateAsync,
    mutate: mockUpdateTodoMutate,
    isPending: mockUpdateTodoIsPending,
  }),
}));

const mockDeleteTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useDeleteTodo", () => ({
  useDeleteTodo: () => ({ mutateAsync: mockDeleteTodoMutateAsync }),
}));

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockRouteParams: { id: string } = { id: "root-1" };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate, push: mockPush }),
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
    mockUpdateTodoMutate.mockReset();
    mockUpdateTodoIsPending = false;
    mockDeleteTodoMutateAsync.mockReset();
    mockGoBack.mockReset();
    mockNavigate.mockReset();
    mockPush.mockReset();
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

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "root-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("이전 상태 변경이 진행 중이면 상태 배지를 눌러도 바텀시트가 열리지 않는다(더블탭 방지)", async () => {
    mockUpdateTodoIsPending = true;
    mockUseTodos.mockReturnValue({ data: [rootTodo({ status: "todo" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("detail-status-badge"));

    expect(screen.queryByText("상태 선택")).toBeNull();
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
  });

  it("자식의 편집 아이콘을 누르면 push로 그 자식의 상세로 이동한다(같은 라우트 재사용으로 인한 상태 오염 방지)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("edit-child-child-1"));

    expect(mockPush).toHaveBeenCalledWith("TodoDetail", { id: "child-1" });
    expect(mockNavigate).not.toHaveBeenCalledWith("TodoDetail", expect.anything());
  });

  it("자식의 상태 점을 누르면 같은 바텀시트가 그 자식 기준으로 열린다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1", status: "todo" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("status-dot-child-1"));
    fireEvent.press(await screen.findByText("완료"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "child-1",
      fields: { status: "done", doneAt: expect.any(String) },
    });
  });

  it("자식 삭제 버튼을 누르고 확정하면 그 자식이 삭제된다", async () => {
    const { Alert } = require("react-native");
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" }),
      ],
    });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("delete-child-child-1"));

    const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [
      string,
      string,
      { text: string; style?: string; onPress?: () => void }[],
    ];
    const destructive = call[2].find((button) => button.style === "destructive");
    await destructive?.onPress?.();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("child-1");
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

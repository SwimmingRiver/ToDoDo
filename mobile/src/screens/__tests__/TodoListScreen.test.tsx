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

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

type AlertButton = { text: string; style?: string; onPress?: () => void };

// Alert.alert는 네이티브 모듈이라 테스트 환경에서는 실제 다이얼로그를 띄우지 않는다.
// "삭제"(style: destructive) 버튼의 onPress를 직접 호출해 사용자가 삭제를 확정한
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

const rootTodo = (overrides: Record<string, unknown> = {}) => ({
  id: "root-1",
  title: "루트 할 일",
  parentId: null,
  status: "todo",
  priority: "medium",
  order: 0,
  dueAt: null,
  recurrenceId: null,
  recurrence: null,
  ...overrides,
});

const childTodo = (overrides: Record<string, unknown> = {}) => ({
  id: "child-1",
  title: "하위 할 일",
  parentId: "root-1",
  status: "todo",
  priority: "medium",
  order: 0,
  dueAt: null,
  recurrenceId: null,
  recurrence: null,
  ...overrides,
});

describe("TodoListScreen", () => {
  beforeEach(() => {
    mockDeleteTodoMutateAsync.mockReset();
    mockUpdateTodoMutate.mockReset();
    mockUpdateTodoIsPending = false;
    mockNavigate.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (Alert.alert as jest.Mock).mockClear();
  });

  it("루트 할 일 제목과 프로젝트 개수를 렌더링한다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("루트 할 일")).toBeTruthy();
    expect(screen.getByText("프로젝트 1개")).toBeTruthy();
  });

  it("하위 할 일은 펼치기 전에는 보이지 않다가, 펼치면 보인다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.queryByText("하위 할 일")).toBeNull();

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));

    // RN 테스트 환경에서는 Pressable onPress로 트리거된 상태 갱신이 다음 틱에
    // 반영되어, press 직후 동기 조회로는 아직 못 찾는다(BottomSheet Modal과
    // 동일한 이유). findBy*로 다음 틱까지 기다린다.
    expect(await screen.findByText("하위 할 일")).toBeTruthy();
  });

  it("카드 제목 영역을 탭하면 상세 화면으로 이동한다(펼치기/접기는 화살표 전용)", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-title-root-1"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "root-1" });
    expect(screen.queryByText("하위 할 일")).toBeNull();
  });

  it("펼쳤는데 하위 항목이 없으면 안내 문구를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));

    expect(await screen.findByText("하위 항목이 없습니다")).toBeTruthy();
  });

  it("루트가 done이면 목록에서 완전히 숨겨진다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo({ id: "done-root", title: "완료된 루트", status: "done" })],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.queryByText("완료된 루트")).toBeNull();
    expect(screen.getByText("할 일이 없습니다")).toBeTruthy();
  });

  it("루트가 전부 done이면(하위 데이터는 남아있어도) 빈 상태로 표시된다(빈 상태 판정 정정)", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        rootTodo({ id: "done-root", title: "완료된 루트", status: "done" }),
        childTodo({ id: "done-child", title: "완료된 루트의 자식", parentId: "done-root" }),
      ],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("할 일이 없습니다")).toBeTruthy();
    expect(
      screen.getByText("새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"),
    ).toBeTruthy();
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

  it("반복 배지, 밀린 횟수 배지, 초과 배지를 조건에 맞게 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        rootTodo({
          id: "rec-1",
          title: "반복 할 일",
          recurrenceId: "series-1",
          dueAt: "2020-01-01T00:00:00.000Z",
        }),
        rootTodo({
          id: "rec-missed",
          title: "밀린 형제",
          recurrenceId: "series-1",
          overdueArchived: true,
          dueAt: "2019-12-01T00:00:00.000Z",
        }),
      ],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("반복")).toBeTruthy();
    expect(screen.getByText("1회 밀림")).toBeTruthy();
    expect(screen.getByText(/일 초과/)).toBeTruthy();
  });

  it("프로젝트 삭제 버튼을 누르면 확인 다이얼로그를 띄우고, 확인 전에는 삭제 요청을 보내지 않는다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("프로젝트 삭제"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "프로젝트 삭제",
      expect.any(String),
      expect.any(Array),
    );
    expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
  });

  it("프로젝트 삭제를 확정하면 실제로 삭제 요청을 보낸다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("프로젝트 삭제"));
    await confirmAlertDelete();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("root-1");
  });

  it("자식 할 일 삭제 버튼을 누르면 '할 일 삭제' 확인 다이얼로그를 띄운다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));
    fireEvent.press(await screen.findByTestId("delete-child-child-1"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "할 일 삭제",
      expect.stringContaining("하위 할 일"),
      expect.any(Array),
    );
  });

  it("자식 삭제를 확정하면 실제로 삭제 요청을 보낸다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));
    fireEvent.press(await screen.findByTestId("delete-child-child-1"));
    await confirmAlertDelete();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("child-1");
  });

  it("삭제에 실패하면 해당 카드에 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });
    mockDeleteTodoMutateAsync.mockRejectedValue(new Error("네트워크 오류"));

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByLabelText("프로젝트 삭제"));
    await confirmAlertDelete();

    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
  });

  it("루트 상태 점을 누르면 상태 선택 바텀시트가 열린다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.queryByText("상태 선택")).toBeNull();

    fireEvent.press(screen.getByTestId("status-dot-root-1"));

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
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-dot-root-1"));
    fireEvent.press(await screen.findByText("진행 중"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "root-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("바텀시트에서 '완료'를 선택하면 doneAt이 현재 시간으로 설정된다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo({ status: "doing" })],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-dot-root-1"));
    fireEvent.press(await screen.findByText("완료"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "root-1",
      fields: { status: "done", doneAt: expect.any(String) },
    });
  });

  it("자식 할 일의 상태 점을 눌러도 같은 바텀시트가 해당 자식 기준으로 열린다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));
    fireEvent.press(await screen.findByTestId("status-dot-child-1"));
    fireEvent.press(await screen.findByText("진행 중"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "child-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("이전 상태 변경이 진행 중이면 상태 점을 눌러도 바텀시트가 열리지 않는다(더블탭 방지)", async () => {
    mockUpdateTodoIsPending = true;
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("status-dot-root-1"));

    expect(screen.queryByText("상태 선택")).toBeNull();
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
  });

  it("자식의 편집 버튼을 누르면 그 자식의 상세 화면으로 이동한다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo(), childTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));
    fireEvent.press(await screen.findByTestId("edit-child-child-1"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "child-1" });
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
    expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
  });

  it("펼친 카드의 하위 할 일 추가 버튼을 누르면 TodoForm으로 parentId와 함께 이동한다", async () => {
    mockUseTodos.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [rootTodo()],
    });

    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    fireEvent.press(screen.getByTestId("toggle-expand-chevron-root-1"));
    fireEvent.press(await screen.findByLabelText("하위 할 일 추가"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { parentId: "root-1" });
  });
});

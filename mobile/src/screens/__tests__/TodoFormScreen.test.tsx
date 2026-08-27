import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockMutateAsync = jest.fn<() => Promise<string>>();
jest.mock("../../hooks/useCreateTodo", () => ({
  useCreateTodo: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockGoBack = jest.fn();
let mockRouteParams: { parentId?: string; dueAt?: string } | undefined = undefined;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

describe("TodoFormScreen", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockGoBack.mockReset();
    mockUseTodos.mockReturnValue({ data: [] });
    mockRouteParams = undefined;
  });

  it("제목이 공백뿐이면 생성 요청을 보내지 않는다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "   ");
    // changeText로 예약된 상태 갱신이 커밋된 뒤에 눌러야 press가 최신 title을
    // 반영한 handleSubmit을 호출한다 (아래 두 번째 테스트의 주석 참고).
    await screen.findByDisplayValue("   ");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("생성에 실패하면 에러 메시지를 보여주고 이전 화면으로 돌아가지 않는다", async () => {
    mockMutateAsync.mockRejectedValue(new Error("네트워크 오류"));

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "새 할 일");
    // changeText로 예약된 setTitle 상태 갱신이 실제로 반영된 뒤에 제출해야 한다.
    // 그렇지 않으면 press가 title="" 상태를 캡처한 이전 렌더의 handleSubmit을
    // 호출해 빈 제목 가드에 걸려 조용히 아무 일도 일어나지 않는다.
    await screen.findByDisplayValue("새 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  // design/spec.md "TodoFormScreen — 펼침(더보기)" 절: "더보기"를 누르면 설명/우선순위/
  // 시작일시/만료일시가 나타난다(웹 DetailSection과 동일한 정보 위계).
  it("더보기를 누르면 설명/우선순위/날짜 필드가 나타난다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    expect(screen.queryByPlaceholderText("상세 설명을 입력하세요")).toBeNull();

    // ScrollView 하위에서의 상태 갱신은 act(async)로 감싸야 다음 조회에 반영된다
    // (RN Modal과 마찬가지로 이 테스트 환경의 act() 플러시 타이밍 특성).
    await act(async () => {
      fireEvent.press(screen.getByText("더보기"));
    });

    expect(screen.getByPlaceholderText("상세 설명을 입력하세요")).toBeTruthy();
    expect(screen.getByText("낮음")).toBeTruthy();
    expect(screen.getByText("보통")).toBeTruthy();
    expect(screen.getByText("높음")).toBeTruthy();
    expect(screen.getByText("시작일시")).toBeTruthy();
    expect(screen.getByText("만료일시")).toBeTruthy();
  });

  // 의사결정 확정 1번(design/spec.md): <select> 대신 3-세그먼트 칩.
  it("우선순위 칩을 선택하면 선택 상태가 바뀐다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("더보기"));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("우선순위 높음"));
    });

    expect(screen.getByLabelText("우선순위 높음").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("우선순위 보통").props.accessibilityState.selected).toBe(false);
  });

  it("route.params.parentId가 있으면 그 부모 밑에 생성 요청을 보낸다", async () => {
    mockRouteParams = { parentId: "root-1" };

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "하위 할 일");
    await screen.findByDisplayValue("하위 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "root-1" }),
    );
  });

  it("route.params.dueAt이 있으면 그 값을 dueAt으로 채워 생성 요청을 보낸다", async () => {
    mockRouteParams = { dueAt: "2026-06-18T00:00:00.000Z" };

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    // dueAt이 프리필되면 "더보기"를 누르지 않아도 날짜 필드가 바로 보여야 한다.
    expect(screen.getByText("만료일시")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "프리필 할 일");
    await screen.findByDisplayValue("프리필 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: "2026-06-18T00:00:00.000Z" }),
    );
  });
});

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
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

describe("TodoFormScreen", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockGoBack.mockReset();
    mockUseTodos.mockReturnValue({ data: [] });
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
});

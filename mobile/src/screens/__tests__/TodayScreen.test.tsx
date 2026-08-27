import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockUseTodayTodos = jest.fn();
jest.mock("../../hooks/useTodayTodos", () => ({
  useTodayTodos: (...args: unknown[]) => mockUseTodayTodos(...args),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const baseTodo = {
  id: "a",
  userId: "u1",
  title: "오늘 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("TodayScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("로딩 중이면 스켈레톤을 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: true, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("항목이 없으면 빈 상태를 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    expect(screen.getByText("오늘 할 일이 없습니다")).toBeTruthy();
  });

  it("진행중 항목을 '진행 중' 섹션에 렌더링한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [baseTodo], doneTodos: [], doneCount: 0, totalCount: 1,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("오늘 할 일")).toBeTruthy();
  });

  it("항목을 누르면 TodoDetail로 navigate한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [baseTodo], doneTodos: [], doneCount: 0, totalCount: 1,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    fireEvent.press(screen.getByText("오늘 할 일"));
    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
  });

  it("'할 일 추가' 버튼을 누르면 선택 날짜를 dueAt으로 채워 TodoForm으로 navigate한다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: false, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    fireEvent.press(screen.getByText("할 일 추가"));
    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { dueAt: expect.any(String) });
  });

  it("불러오기 실패 시 에러 상태를 보여준다", async () => {
    mockUseTodayTodos.mockReturnValue({
      inProgressTodos: [], doneTodos: [], doneCount: 0, totalCount: 0,
      markers: {}, isLoading: false, isError: true, toggleDone: jest.fn(),
    });
    const { TodayScreen } = await import("../TodayScreen");
    await render(<TodayScreen />);
    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });
});

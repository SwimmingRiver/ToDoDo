import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";

const mockUseCalendarTodos = jest.fn();
jest.mock("../../hooks/useCalendarTodos", () => ({
  useCalendarTodos: () => mockUseCalendarTodos(),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// react-native-calendars의 실제 월간 그리드 렌더링은 이 스크린의 관심사가 아니다
// (라이브러리 자체 동작은 Task 1에서 별도 검증). onDayPress 배선만 검증할 수 있도록
// 최소 스텁으로 대체한다.
jest.mock("react-native-calendars", () => {
  const { Pressable, Text } = require("react-native");
  return {
    Calendar: ({ onDayPress }: { onDayPress: (day: { dateString: string }) => void }) => (
      <Pressable testID="calendar-day-2026-06-20" onPress={() => onDayPress({ dateString: "2026-06-20" })}>
        <Text>20</Text>
      </Pressable>
    ),
    // CalendarScreen.tsx가 모듈 스코프에서 LocaleConfig.locales.ko를 등록하므로,
    // 이 mock도 실제 라이브러리와 같은 모양(locales 객체)을 제공해야 한다.
    LocaleConfig: { locales: {}, defaultLocale: "en" },
  };
});

const baseTodo: Todo = {
  id: "a",
  userId: "u1",
  title: "할 일 A",
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

describe("CalendarScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("로딩 중이면 스켈레톤을 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: true,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("불러오기 실패 시 에러 상태를 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: true,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });

  it("날짜를 탭하면 시트가 열리고 그 날짜의 항목만 보여준다", async () => {
    const getTodosForDate = jest.fn((dateKey: string) => (dateKey === "2026-06-20" ? [baseTodo] : []));
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate,
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));

    await waitFor(() => {
      expect(screen.getByText("할 일 A")).toBeTruthy();
    });
    expect(getTodosForDate).toHaveBeenCalledWith("2026-06-20");
  });

  it("항목이 없는 날짜를 탭해도 시트가 열리고 빈 상태를 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));

    await waitFor(() => {
      expect(screen.getByText("이 날짜엔 할 일이 없어요")).toBeTruthy();
    });
  });

  it("시트의 '할 일 추가'를 누르면 탭한 날짜를 dueAt으로 채워 TodoForm으로 navigate한다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
    await waitFor(() => screen.getByText("할 일 추가"));
    fireEvent.press(screen.getByText("할 일 추가"));

    const expectedDueAt = new Date(2026, 5, 20).toISOString();
    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { dueAt: expectedDueAt });
  });

  it("시트의 항목을 누르면 TodoDetail로 navigate한다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [baseTodo],
      toggleDone: jest.fn(),
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
    await waitFor(() => screen.getByText("할 일 A"));
    fireEvent.press(screen.getByText("할 일 A"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
  });
});

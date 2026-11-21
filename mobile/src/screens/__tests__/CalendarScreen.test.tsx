import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
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
  const { Pressable, Text, View } = require("react-native");
  return {
    Calendar: ({
      onDayPress,
      onMonthChange,
      markedDates,
    }: {
      onDayPress: (day: { dateString: string }) => void;
      onMonthChange?: (month: { year: number; month: number; dateString: string }) => void;
      markedDates?: Record<string, { dots: { key: string }[] }>;
    }) => (
      <View>
        <Pressable testID="calendar-day-2026-06-20" onPress={() => onDayPress({ dateString: "2026-06-20" })}>
          <Text>20</Text>
        </Pressable>
        <Pressable
          testID="calendar-next-month"
          onPress={() => onMonthChange?.({ year: 2026, month: 7, dateString: "2026-07-01" })}
        />
        {Object.entries(markedDates ?? {}).flatMap(([date, marking]) =>
          marking.dots.map((dot) => <View key={`${date}-${dot.key}`} testID={`calendar-dot-${date}-${dot.key}`} />),
        )}
      </View>
    ),
    // CalendarScreen.tsx가 모듈 스코프에서 LocaleConfig.locales.ko를 등록하므로,
    // 이 mock도 실제 라이브러리와 같은 모양(locales 객체)을 제공해야 한다.
    LocaleConfig: { locales: {}, defaultLocale: "en" },
  };
});

// 연결 줄은 자체 테스트(CalendarConnectionBar.test.tsx)에서 검증한다.
jest.mock("../../calendarIntegration/components/CalendarConnectionBar", () => {
  const { View } = require("react-native");
  return { CalendarConnectionBar: () => <View testID="calendar-connection-bar" /> };
});

type EventsResult = { data?: { id: string; title: string; start: string; end: string }[]; isError?: boolean };
const mockUseGoogleCalendarEvents = jest.fn<(range: { start: string; end: string } | null) => EventsResult>(
  () => ({ data: undefined }),
);
jest.mock("../../calendarIntegration/useGoogleCalendarEvents", () => ({
  useGoogleCalendarEvents: (range: { start: string; end: string } | null) => mockUseGoogleCalendarEvents(range),
}));

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
  beforeEach(() => {
    // 보이는 달(초기값 = 오늘이 속한 달)을 2026년 6월로 고정한다. 타이머는 실제로 두어
    // waitFor·Modal 틱이 그대로 돈다.
    jest.useFakeTimers({
      now: new Date(2026, 5, 15, 12, 0),
      doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask"],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockUseGoogleCalendarEvents.mockImplementation(() => ({ data: undefined }));
  });

  it("로딩 중이면 스켈레톤을 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      todos: [],
      markedDates: {},
      isLoading: true,
      isError: false,
      getTodosForDate: () => [],
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("불러오기 실패 시 에러 상태를 보여준다", async () => {
    mockUseCalendarTodos.mockReturnValue({
      todos: [],
      markedDates: {},
      isLoading: false,
      isError: true,
      getTodosForDate: () => [],
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);
    expect(screen.getByText("할 일을 불러오지 못했습니다")).toBeTruthy();
  });

  it("날짜를 탭하면 시트가 열리고 그 날짜의 항목만 보여준다", async () => {
    const getTodosForDate = jest.fn((dateKey: string) => (dateKey === "2026-06-20" ? [baseTodo] : []));
    mockUseCalendarTodos.mockReturnValue({
      todos: [],
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate,
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
      todos: [],
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
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
      todos: [],
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [],
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
      todos: [],
      markedDates: {},
      isLoading: false,
      isError: false,
      getTodosForDate: () => [baseTodo],
    });
    const { CalendarScreen } = await import("../CalendarScreen");
    await render(<CalendarScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
    await waitFor(() => screen.getByText("할 일 A"));
    fireEvent.press(screen.getByText("할 일 A"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
  });

  describe("구글 캘린더 오버레이", () => {
    const syncedTodo: Todo = { ...baseTodo, id: "s", title: "동기화된 할 일", googleEventId: "ev-synced" };
    const juneEvents = [
      { id: "ev-synced", title: "동기화된 할 일", start: "2026-06-10", end: "2026-06-11" },
      { id: "ev-1", title: "가족 모임", start: "2026-06-20", end: "2026-06-21" },
    ];
    const juneRange = {
      start: new Date(2026, 5, 1).toISOString(),
      end: new Date(2026, 6, 1).toISOString(),
    };

    const setup = () =>
      mockUseCalendarTodos.mockReturnValue({
        todos: [syncedTodo],
        markedDates: {},
        isLoading: false,
        isError: false,
        getTodosForDate: () => [],
      });

    it("보이는 달 범위로 조회하고, 이미 동기화된 이벤트는 점·시트에서 뺀다", async () => {
      setup();
      mockUseGoogleCalendarEvents.mockImplementation(() => ({ data: juneEvents }));
      const { CalendarScreen } = await import("../CalendarScreen");
      await render(<CalendarScreen />);

      expect(mockUseGoogleCalendarEvents).toHaveBeenCalledWith(juneRange);
      expect(screen.getByTestId("calendar-dot-2026-06-20-google")).toBeTruthy();
      expect(screen.queryByTestId("calendar-dot-2026-06-10-google")).toBeNull();

      await fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
      await waitFor(() => {
        expect(screen.getByText("가족 모임")).toBeTruthy();
      });
      expect(screen.getByText("구글 캘린더 · 종일")).toBeTruthy();
      expect(screen.queryByText("동기화된 할 일")).toBeNull();
    });

    it("달을 넘기면 새 달 범위로 다시 조회한다", async () => {
      setup();
      const { CalendarScreen } = await import("../CalendarScreen");
      await render(<CalendarScreen />);

      await fireEvent.press(screen.getByTestId("calendar-next-month"));

      await waitFor(() => {
        expect(mockUseGoogleCalendarEvents).toHaveBeenLastCalledWith({
          start: new Date(2026, 6, 1).toISOString(),
          end: new Date(2026, 7, 1).toISOString(),
        });
      });
    });

    it("이벤트 조회가 실패해도 할 일 달력과 연결 줄을 그대로 보여준다", async () => {
      setup();
      mockUseGoogleCalendarEvents.mockImplementation(() => ({ data: undefined, isError: true }));
      const { CalendarScreen } = await import("../CalendarScreen");
      await render(<CalendarScreen />);

      expect(screen.getByTestId("calendar-day-2026-06-20")).toBeTruthy();
      expect(screen.getByTestId("calendar-connection-bar")).toBeTruthy();
      expect(screen.queryByText("할 일을 불러오지 못했습니다")).toBeNull();
    });
  });
});

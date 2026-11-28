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
  const React = require("react");
  const { Pressable, Text, View } = require("react-native");
  type mockMonthData = { year: number; month: number; dateString: string };
  const toMonthKey = (date?: string) => {
    if (date) return date.slice(0, 7);
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };
  // 실제 라이브러리처럼 보이는 달을 내부 상태로 들고: 초기값은 initialDate(없으면 오늘),
  // initialDate가 바뀌면 따라가며, 보이는 달이 바뀔 때마다(마운트 포함) onMonthChange를 쏜다.
  const Calendar = ({
    initialDate,
    onDayPress,
    onMonthChange,
    markedDates,
  }: {
    initialDate?: string;
    onDayPress: (day: { dateString: string }) => void;
    onMonthChange?: (month: mockMonthData) => void;
    markedDates?: Record<string, { dots: { key: string }[] }>;
  }) => {
    const [monthKey, setMonthKey] = React.useState(() => toMonthKey(initialDate));
    React.useEffect(() => {
      if (initialDate) setMonthKey(toMonthKey(initialDate));
    }, [initialDate]);
    React.useEffect(() => {
      const [year, month] = monthKey.split("-").map(Number);
      onMonthChange?.({ year, month, dateString: `${monthKey}-01` });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthKey]);
    const goNextMonth = () => {
      const [year, month] = monthKey.split("-").map(Number);
      const next = new Date(year, month, 1);
      setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    };
    return (
      <View>
        <Text testID="calendar-visible-month">{monthKey}</Text>
        <Pressable testID="calendar-day-2026-06-20" onPress={() => onDayPress({ dateString: "2026-06-20" })}>
          <Text>20</Text>
        </Pressable>
        <Pressable testID="calendar-next-month" onPress={goNextMonth} />
        {Object.entries(markedDates ?? {}).flatMap(([date, marking]) =>
          marking.dots.map((dot) => <View key={`${date}-${dot.key}`} testID={`calendar-dot-${date}-${dot.key}`} />),
        )}
      </View>
    );
  };
  return {
    Calendar,
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

    it("오류로 달력이 내려갔다 다시 올라와도 사용자가 보던 달을 유지하고 그 달을 조회한다", async () => {
      setup();
      const { CalendarScreen } = await import("../CalendarScreen");
      await render(<CalendarScreen />);

      await fireEvent.press(screen.getByTestId("calendar-next-month"));
      await waitFor(() => expect(screen.getByTestId("calendar-visible-month")).toHaveTextContent("2026-07"));

      // 백그라운드 재조회 실패 → 오류 화면(달력 언마운트) → 회복(달력 재마운트).
      mockUseCalendarTodos.mockReturnValue({
        todos: [],
        markedDates: {},
        isLoading: false,
        isError: true,
        getTodosForDate: () => [],
      });
      await screen.rerender(<CalendarScreen />);
      expect(screen.queryByTestId("calendar-visible-month")).toBeNull();
      setup();
      await screen.rerender(<CalendarScreen />);

      await waitFor(() => expect(screen.getByTestId("calendar-visible-month")).toHaveTextContent("2026-07"));
      expect(mockUseGoogleCalendarEvents).toHaveBeenLastCalledWith({
        start: new Date(2026, 6, 1).toISOString(),
        end: new Date(2026, 7, 1).toISOString(),
      });
    });
  });

  describe("주간 보기", () => {
    const weekTodo: Todo = { ...baseTodo, id: "w", title: "주간 제목", dueAt: new Date(2026, 5, 16, 10).toISOString() };
    const setup = () => {
      const getTodosForDate = jest.fn((dateKey: string) => (dateKey === "2026-06-16" ? [weekTodo] : []));
      mockUseCalendarTodos.mockReturnValue({
        todos: [weekTodo],
        markedDates: {},
        isLoading: false,
        isError: false,
        getTodosForDate,
      });
      return getTodosForDate;
    };
    const renderScreen = async () => {
      const { CalendarScreen } = await import("../CalendarScreen");
      await render(<CalendarScreen />);
    };

    it("주간으로 바꾸면 이번 주 7줄과 주 라벨, 그 주 범위로 구글 일정을 조회한다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("view-mode-week"));

      ["14", "15", "16", "17", "18", "19", "20"].forEach((d) =>
        expect(screen.getByTestId(`week-row-2026-06-${d}`)).toBeTruthy(),
      );
      expect(screen.getByText("6월 14일 – 20일")).toBeTruthy();
      expect(mockUseGoogleCalendarEvents).toHaveBeenLastCalledWith({
        start: new Date(2026, 5, 14).toISOString(),
        end: new Date(2026, 5, 21).toISOString(),
      });
    });

    it("할 일 제목이 그날 줄에 칩으로 보인다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      expect(screen.getByTestId("week-chip-todo-w")).toBeTruthy();
      expect(screen.getByText("주간 제목")).toBeTruthy();
    });

    it("다음 주·오늘 버튼으로 주를 옮긴다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      await fireEvent.press(screen.getByLabelText("다음 주"));
      expect(screen.getByTestId("week-row-2026-06-21")).toBeTruthy();
      expect(screen.queryByTestId("week-row-2026-06-14")).toBeNull();
      await fireEvent.press(screen.getByLabelText("오늘"));
      expect(screen.getByTestId("week-row-2026-06-14")).toBeTruthy();
    });

    it("줄을 누르면 그 날짜로 날짜 시트가 열린다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      await fireEvent.press(screen.getByTestId("week-row-2026-06-17"));
      await waitFor(() => expect(screen.getByText("6월 17일, 수요일")).toBeTruthy());
    });

    it("월간에서 고른 날짜의 주로 바뀌고 그 줄이 선택 상태다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      expect(screen.getByTestId("week-row-2026-06-14")).toBeTruthy();
      expect(screen.getByTestId("week-row-2026-06-20").props.accessibilityState).toEqual({ selected: true });
    });

    it("다른 달로 넘긴 뒤의 옛 선택은 무시하고 그 달 1일이 든 주로 간다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));
      await fireEvent.press(screen.getByTestId("calendar-next-month"));
      await waitFor(() => expect(screen.getByTestId("calendar-visible-month").props.children).toBe("2026-07"));
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      expect(screen.getByTestId("week-row-2026-06-28")).toBeTruthy();
      expect(screen.getByTestId("week-row-2026-07-01")).toBeTruthy();
    });

    it("주간에서 넘긴 주의 달로 월간이 돌아온다", async () => {
      setup();
      await renderScreen();
      await fireEvent.press(screen.getByTestId("view-mode-week"));
      for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByLabelText("다음 주"));
      expect(screen.getByTestId("week-row-2026-07-05")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("view-mode-month"));
      await waitFor(() => expect(screen.getByTestId("calendar-visible-month").props.children).toBe("2026-07"));
    });
  });
});

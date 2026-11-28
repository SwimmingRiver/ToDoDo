import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { WeekHeader } from "../components/WeekHeader";
import { WeekRowsView } from "../components/WeekRowsView";

describe("ViewModeToggle", () => {
  it("주간을 누르면 week로 바꾸고, 현재 모드가 선택 상태다", async () => {
    const onChange = jest.fn();
    await render(<ViewModeToggle mode="month" onChange={onChange} />);
    expect(screen.getByTestId("view-mode-month").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId("view-mode-week").props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByText("주간"));
    expect(onChange).toHaveBeenCalledWith("week");
  });
});

describe("WeekHeader", () => {
  it("라벨과 이전·다음·오늘 버튼", async () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const onToday = jest.fn();
    await render(<WeekHeader label="11월 22일 – 28일" onPrev={onPrev} onNext={onNext} onToday={onToday} />);
    expect(screen.getByText("11월 22일 – 28일")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("이전 주"));
    await fireEvent.press(screen.getByLabelText("다음 주"));
    await fireEvent.press(screen.getByLabelText("오늘"));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});

describe("WeekRowsView", () => {
  it("일~토 7줄, 줄의 칩, 누르면 날짜를 넘긴다", async () => {
    const onPressDate = jest.fn();
    await render(
      <WeekRowsView
        weekStartKey="2026-11-22"
        itemsByDate={{
          "2026-11-24": [{ key: "todo-a", title: "화요일 할 일", dotColor: "#000", muted: false, kind: "todo" }],
        }}
        todayKey="2026-11-28"
        selectedDate={null}
        onPressDate={onPressDate}
        onSwipeWeek={() => {}}
      />,
    );
    const keys = ["22", "23", "24", "25", "26", "27", "28"].map((d) => `2026-11-${d}`);
    keys.forEach((key) => expect(screen.getByTestId(`week-row-${key}`)).toBeTruthy());
    expect(screen.getByTestId("week-chip-todo-a")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("week-row-2026-11-26"));
    expect(onPressDate).toHaveBeenCalledWith("2026-11-26");
  });

  it("선택된 날짜 줄은 selected 상태다", async () => {
    await render(
      <WeekRowsView
        weekStartKey="2026-11-22"
        itemsByDate={{}}
        todayKey="2026-11-28"
        selectedDate="2026-11-25"
        onPressDate={() => {}}
        onSwipeWeek={() => {}}
      />,
    );
    expect(screen.getByTestId("week-row-2026-11-25").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId("week-row-2026-11-24").props.accessibilityState).toEqual({ selected: false });
  });
});

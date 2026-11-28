import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { WeekDayRow } from "../components/WeekDayRow";
import type { WeekDayItem } from "../weekDayItems";

const item = (key: string, kind: WeekDayItem["kind"] = "todo"): WeekDayItem => ({
  key,
  title: `제목 ${key}`,
  dotColor: "#000",
  muted: kind === "google",
  kind,
});

// 측정 층은 접근성 트리에서 숨기므로(스크린리더가 칩을 두 번 읽지 않게) 쿼리에 포함 옵션이 필요하다.
const HIDDEN = { includeHiddenElements: true };

const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 100, height } } });

describe("WeekDayRow", () => {
  it("요일·날짜·칩 제목을 그리고 누르면 날짜를 넘긴다", async () => {
    const onPress = jest.fn();
    await render(
      <WeekDayRow dateKey="2026-11-24" items={[item("todo-a")]} isToday={false} isSelected={false} onPress={onPress} />,
    );
    expect(screen.getByText("화")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("제목 todo-a")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("week-row-2026-11-24"));
    expect(onPress).toHaveBeenCalledWith("2026-11-24");
  });

  it("접근성 라벨에 날짜와 개수, 선택 상태를 담는다", async () => {
    await render(
      <WeekDayRow
        dateKey="2026-11-23"
        items={[item("todo-a"), item("todo-b"), item("google-g", "google")]}
        isToday={false}
        isSelected
        onPress={() => {}}
      />,
    );
    const row = screen.getByTestId("week-row-2026-11-23");
    expect(row.props.accessibilityLabel).toBe("11월 23일 월요일, 할 일 2개, 구글 일정 1개");
    expect(row.props.accessibilityState).toEqual({ selected: true });
  });

  it("칩이 넘치면 들어가는 만큼만 그리고 +n을 붙인다", async () => {
    const items = ["a", "b", "c", "d", "e", "f"].map((k) => item(`todo-${k}`));
    await render(
      <WeekDayRow dateKey="2026-11-24" items={items} isToday={false} isSelected={false} onPress={() => {}} />,
    );
    // 측정 전에는 전부 그린다.
    expect(screen.getByTestId("week-chip-todo-f")).toBeTruthy();
    const bottoms = [20, 20, 44, 44, 68, 68];
    for (const [i, it] of items.entries()) {
      await fireEvent(screen.getByTestId(`week-measure-${it.key}`, HIDDEN), "layout", layout(bottoms[i] - 20, 20));
    }
    await fireEvent(screen.getByTestId("week-chips-2026-11-24"), "layout", layout(0, 50));

    expect(screen.getByTestId("week-chip-todo-d")).toBeTruthy();
    expect(screen.queryByTestId("week-chip-todo-e")).toBeNull();
    expect(screen.getByTestId("week-more-2026-11-24").props.children).toBe("+2");
  });

  it("다 들어가면 +n이 없다", async () => {
    const items = [item("todo-a"), item("todo-b")];
    await render(
      <WeekDayRow dateKey="2026-11-24" items={items} isToday={false} isSelected={false} onPress={() => {}} />,
    );
    for (const it of items) {
      await fireEvent(screen.getByTestId(`week-measure-${it.key}`, HIDDEN), "layout", layout(0, 20));
    }
    await fireEvent(screen.getByTestId("week-chips-2026-11-24"), "layout", layout(0, 70));
    expect(screen.queryByTestId("week-more-2026-11-24")).toBeNull();
    expect(screen.getByTestId("week-chip-todo-b")).toBeTruthy();
  });

  it("항목이 바뀌면, 위치가 그대로인 칩은 layout을 다시 안 쏴도 새 칩 측정만으로 +n을 다시 계산한다", async () => {
    const first = [item("todo-a"), item("todo-b")];
    const { rerender } = await render(
      <WeekDayRow dateKey="2026-11-24" items={first} isToday={false} isSelected={false} onPress={() => {}} />,
    );
    await fireEvent(screen.getByTestId("week-measure-todo-a", HIDDEN), "layout", layout(0, 20));
    await fireEvent(screen.getByTestId("week-measure-todo-b", HIDDEN), "layout", layout(0, 20));
    await fireEvent(screen.getByTestId("week-chips-2026-11-24"), "layout", layout(0, 30));
    expect(screen.queryByTestId("week-more-2026-11-24")).toBeNull();

    // 새 배열(같은 a·b + 새 c). RN은 위치가 안 바뀐 a·b에 onLayout을 다시 쏘지 않는다 — c만 쏜다.
    await rerender(
      <WeekDayRow
        dateKey="2026-11-24"
        items={[item("todo-a"), item("todo-b"), item("todo-c")]}
        isToday={false}
        isSelected={false}
        onPress={() => {}}
      />,
    );
    await fireEvent(screen.getByTestId("week-measure-todo-c", HIDDEN), "layout", layout(24, 20));
    expect(screen.getByTestId("week-more-2026-11-24").props.children).toBe("+1");
  });

  it("+n은 칩 흐름 밖(오른쪽 아래 고정)에 그려 큰 글씨로 칩이 한 줄만 들어가도 잘리지 않는다", async () => {
    const items = ["a", "b", "c"].map((k) => item(`todo-${k}`));
    await render(
      <WeekDayRow dateKey="2026-11-24" items={items} isToday={false} isSelected={false} onPress={() => {}} />,
    );
    const bottoms = [20, 44, 68];
    for (const [i, it] of items.entries()) {
      await fireEvent(screen.getByTestId(`week-measure-${it.key}`, HIDDEN), "layout", layout(bottoms[i] - 20, 20));
    }
    await fireEvent(screen.getByTestId("week-chips-2026-11-24"), "layout", layout(0, 30));
    expect(screen.getByTestId("week-chip-todo-a")).toBeTruthy();
    const more = screen.getByTestId("week-more-2026-11-24");
    expect(more.props.children).toBe("+2");
    expect(StyleSheet.flatten(more.props.style)).toMatchObject({ position: "absolute", right: 0, bottom: 0 });
  });
});

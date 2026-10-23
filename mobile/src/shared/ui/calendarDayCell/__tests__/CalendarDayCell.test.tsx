import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { CalendarDayCell } from "../CalendarDayCell";
import { colors } from "../../../../theme/colors";

const date = { year: 2026, month: 6, day: 20, timestamp: 0, dateString: "2026-06-20" };

describe("CalendarDayCell", () => {
  it("칸 전체가 눌림 영역이고 누르면 그 날짜로 onPress를 호출한다", async () => {
    const onPress = jest.fn();
    await render(<CalendarDayCell date={date} state="" onPress={onPress} />);

    fireEvent.press(screen.getByTestId("calendar-day-2026-06-20"));

    expect(onPress).toHaveBeenCalledWith(date);
  });

  it("선택된 날짜는 숫자 원이 brand.strong 배경, 흰 글자다", async () => {
    await render(<CalendarDayCell date={date} state="" marking={{ selected: true }} onPress={jest.fn()} />);

    expect(screen.getByTestId("calendar-day-circle-2026-06-20")).toHaveStyle({
      backgroundColor: colors.brand.strong,
    });
    expect(screen.getByText("20")).toHaveStyle({ color: colors.background.primary });
  });

  it("오늘(선택 안 됨)은 brand.strong 글자, 오늘이면서 선택되면 흰 글자다", async () => {
    const { rerender } = await render(<CalendarDayCell date={date} state="today" onPress={jest.fn()} />);
    expect(screen.getByText("20")).toHaveStyle({ color: colors.brand.strong });

    await rerender(
      <CalendarDayCell date={date} state="today" marking={{ selected: true }} onPress={jest.fn()} />,
    );
    expect(screen.getByText("20")).toHaveStyle({ color: colors.background.primary });
  });

  it("다른 달 날짜(disabled)는 흐린 글자다", async () => {
    await render(<CalendarDayCell date={date} state="disabled" onPress={jest.fn()} />);
    expect(screen.getByText("20")).toHaveStyle({ color: colors.text.tertiary });
  });

  it("marking.dots 개수만큼 해당 색의 점을 그린다", async () => {
    await render(
      <CalendarDayCell
        date={date}
        state=""
        marking={{
          dots: [
            { key: "todo", color: "#111111" },
            { key: "doing", color: "#222222" },
          ],
        }}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByTestId("calendar-dot-2026-06-20-todo")).toHaveStyle({ backgroundColor: "#111111" });
    expect(screen.getByTestId("calendar-dot-2026-06-20-doing")).toHaveStyle({ backgroundColor: "#222222" });
  });
});

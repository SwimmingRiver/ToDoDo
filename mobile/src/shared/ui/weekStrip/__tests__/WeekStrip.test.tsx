import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { WeekStrip } from "../WeekStrip";

describe("WeekStrip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const defaultProps = {
    selectedDate: "2026-06-15",
    windowStart: "2026-06-15",
    markers: {},
    onSelectDate: jest.fn(),
    onShiftLeft: jest.fn(),
    onShiftRight: jest.fn(),
    onGoToToday: jest.fn(),
  };

  // @testing-library/react-native@14의 render()는 async 함수다 — 반드시 await하고
  // it 콜백도 async여야 한다.
  it("windowStart부터 7일의 날짜를 렌더링한다", async () => {
    await render(<WeekStrip {...defaultProps} />);
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
  });

  it("날짜를 누르면 onSelectDate가 호출된다", async () => {
    const onSelectDate = jest.fn();
    await render(<WeekStrip {...defaultProps} onSelectDate={onSelectDate} />);
    fireEvent.press(screen.getByText("16"));
    expect(onSelectDate).toHaveBeenCalledWith("2026-06-16");
  });

  it("왼쪽/오른쪽 화살표를 누르면 각각의 콜백이 호출된다", async () => {
    const onShiftLeft = jest.fn();
    const onShiftRight = jest.fn();
    await render(<WeekStrip {...defaultProps} onShiftLeft={onShiftLeft} onShiftRight={onShiftRight} />);
    await fireEvent.press(screen.getByLabelText("이전 날짜"));
    await fireEvent.press(screen.getByLabelText("다음 날짜"));
    expect(onShiftLeft).toHaveBeenCalledTimes(1);
    expect(onShiftRight).toHaveBeenCalledTimes(1);
  });

  it("오늘이 스트립 안에 있으면 '오늘' 칩을 보여주지 않는다", async () => {
    await render(<WeekStrip {...defaultProps} />);
    expect(screen.queryByLabelText("오늘로 이동")).toBeNull();
  });

  it("오늘이 스트립 밖이면 '오늘' 칩을 보여주고 누르면 onGoToToday가 호출된다", async () => {
    const onGoToToday = jest.fn();
    await render(
      <WeekStrip {...defaultProps} windowStart="2026-07-01" selectedDate="2026-07-01" onGoToToday={onGoToToday} />,
    );
    fireEvent.press(screen.getByLabelText("오늘로 이동"));
    expect(onGoToToday).toHaveBeenCalledTimes(1);
  });
});

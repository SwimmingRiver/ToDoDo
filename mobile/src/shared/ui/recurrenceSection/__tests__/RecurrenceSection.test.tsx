import { StyleSheet } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { END_DATE_BEFORE_START_ERROR, END_DATE_REQUIRED_ERROR } from "@tododo/core";
import { MIN_TOUCH_TARGET } from "../../../../theme/spacing";
import { RecurrenceSection } from "../RecurrenceSection";

const START = new Date(2026, 10, 2, 9).toISOString();
const DAILY = { type: "daily" as const, endType: "indefinite" as const, endDate: null };

describe("RecurrenceSection", () => {
  it("꺼진 상태에서 스위치를 누르면 daily로 켜진다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} value={null} onChange={onChange} />,
    );
    expect(screen.getByText("이 할 일을 반복합니다")).toBeTruthy();
    await fireEvent(screen.getByRole("switch"), "valueChange", true);
    expect(onChange).toHaveBeenCalledWith({ type: "daily", endType: "indefinite", endDate: null });
  });

  it("켜진 상태에서 스위치를 끄면 null이다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ ...DAILY }} onChange={onChange} />,
    );
    await fireEvent(screen.getByRole("switch"), "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("noStartAt 비활성이면 문구가 보이고 onChange가 호출되지 않는다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled disabledReason="noStartAt" startAt={null} value={null} onChange={onChange} />,
    );
    expect(screen.getByText("반복 설정은 시작일시를 입력해야 사용할 수 있습니다")).toBeTruthy();
    const sw = screen.getByRole("switch");
    expect(sw.props.disabled || sw.props.accessibilityState?.disabled).toBeTruthy();
    await fireEvent(sw, "valueChange", true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hasChildren 비활성 문구가 보인다", async () => {
    await render(
      <RecurrenceSection disabled disabledReason="hasChildren" startAt={START} value={null} onChange={jest.fn()} />,
    );
    expect(screen.getByText("하위 할 일이 있는 항목은 반복을 설정할 수 없습니다")).toBeTruthy();
  });

  it("매주 + 빈 요일이면 에러가 보인다", async () => {
    await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ type: "weekly", weekdays: [], endType: "indefinite", endDate: null }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("요일을 하나 이상 선택해주세요")).toBeTruthy();
  });

  it("월 요일을 누르면 정렬된 weekdays로 onChange된다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ type: "weekly", weekdays: [], endType: "indefinite", endDate: null }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByLabelText("월요일"));
    expect(onChange).toHaveBeenCalledWith({ type: "weekly", weekdays: [1], endType: "indefinite", endDate: null });
  });

  it("선택된 요일을 누르면 해제되고 결과는 정렬된다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ type: "weekly", weekdays: [3, 5], endType: "indefinite", endDate: null }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByLabelText("월요일"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [1, 3, 5], endType: "indefinite", endDate: null });
    await fireEvent.press(screen.getByLabelText("수요일"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [5], endType: "indefinite", endDate: null });
  });

  it("주기를 매주로 바꾸면 weekdays가 []이고 다른 주기로 바꾸면 undefined다", async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ ...DAILY }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByText("매주"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [], endType: "indefinite", endDate: null });
    await rerender(
      <RecurrenceSection disabled={false} startAt={START} value={{ type: "weekly", weekdays: [2], endType: "indefinite", endDate: null }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByText("매월"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "monthly", weekdays: undefined, endType: "indefinite", endDate: null });
  });

  it("매월이고 시작일이 30일이면 안내와 31일 보조 문구가 보인다", async () => {
    const startAt = new Date(2026, 10, 30, 7).toISOString();
    await render(
      <RecurrenceSection disabled={false} startAt={startAt} value={{ type: "monthly", endType: "indefinite", endDate: null }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("매월 30일에 반복됩니다 (시작일시 기준)")).toBeTruthy();
    expect(screen.getByText("31일이 없는 달은 해당 월 마지막 날에 생성됩니다")).toBeTruthy();
  });

  it("종료 컨트롤: 라벨, 없음(선택됨)/날짜 지정 라디오 칩, 안내 문구가 보인다", async () => {
    await render(<RecurrenceSection disabled={false} startAt={START} value={{ ...DAILY }} onChange={jest.fn()} />);
    expect(screen.getByText("반복 종료")).toBeTruthy();
    const none = screen.getByRole("radio", { name: "반복 종료 없음" });
    const until = screen.getByRole("radio", { name: "반복 종료 날짜 지정" });
    expect(none.props.accessibilityState.selected).toBe(true);
    expect(until.props.accessibilityState.selected).toBe(false);
    expect(screen.getByText("계속 반복됩니다")).toBeTruthy();
    expect(screen.queryByLabelText(/^반복 종료일/)).toBeNull();
    const style = StyleSheet.flatten(none.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("날짜 지정을 누르면 endDate null로 바뀌고, 이미 선택돼 있으면 아무 일도 없다", async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <RecurrenceSection disabled={false} startAt={START} value={{ ...DAILY }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "반복 종료 날짜 지정" }));
    expect(onChange).toHaveBeenCalledWith({ type: "daily", endType: "untilDate", endDate: null });

    onChange.mockClear();
    await rerender(
      <RecurrenceSection
        disabled={false}
        startAt={START}
        value={{ type: "daily", endType: "untilDate", endDate: "2026-12-31" }}
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "반복 종료 날짜 지정" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("없음을 누르면 indefinite + endDate null이 된다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection
        disabled={false}
        startAt={START}
        value={{ type: "daily", endType: "untilDate", endDate: "2026-12-31" }}
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "반복 종료 없음" }));
    expect(onChange).toHaveBeenCalledWith({ type: "daily", endType: "indefinite", endDate: null });
  });

  it("날짜 지정이면 '반복 종료일' 필드가 보이고, 날짜가 없으면 alert 오류가 보인다", async () => {
    await render(
      <RecurrenceSection
        disabled={false}
        startAt={START}
        value={{ type: "daily", endType: "untilDate", endDate: null }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("반복 종료일, 선택 안 함")).toBeTruthy();
    expect(screen.getByRole("alert", { name: "종료일을 선택해주세요" })).toBeTruthy();
  });

  it("값에 종료일이 있으면 그 날짜를 안내한다", async () => {
    await render(
      <RecurrenceSection
        disabled={false}
        startAt={START}
        value={{ type: "daily", endType: "untilDate", endDate: "2026-12-31" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("2026-12-31까지 반복됩니다")).toBeTruthy();
    expect(screen.getByLabelText("반복 종료일, 2026-12-31")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("종료가 없음이면 종료 관련 오류(alert)가 없다", async () => {
    await render(<RecurrenceSection disabled={false} startAt={START} value={{ ...DAILY }} onChange={jest.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(END_DATE_REQUIRED_ERROR)).toBeNull();
    expect(screen.queryByText(END_DATE_BEFORE_START_ERROR)).toBeNull();
  });

  it("종료일이 시작일보다 이르면 범위 에러가 보인다", async () => {
    await render(
      <RecurrenceSection
        disabled={false}
        startAt={START}
       
        value={{ type: "daily", endType: "untilDate", endDate: "2026-11-01" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("종료일은 시작일과 같거나 이후여야 합니다")).toBeTruthy();
  });

  it("요일 미선택 에러는 그대로 보인다", async () => {
    await render(
      <RecurrenceSection
        disabled={false}
        startAt={START}
       
        value={{ type: "weekly", weekdays: [], endType: "indefinite", endDate: null }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("요일을 하나 이상 선택해주세요")).toBeTruthy();
  });
});

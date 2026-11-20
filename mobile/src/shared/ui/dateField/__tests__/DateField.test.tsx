import { StyleSheet } from "react-native";
import { MIN_TOUCH_TARGET } from "../../../../theme/spacing";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { DateField } from "../DateField";

// 네이티브 피커 대신, 로컬 2026-07-10 00:30 Date를 고르는 스텁.
jest.mock("@react-native-community/datetimepicker", () => {
  const { Pressable, Text } = require("react-native");
  const Picker = ({ onChange, minimumDate }: { onChange: (e: unknown, d: Date) => void; minimumDate?: Date }) => (
    <Pressable testID="picker" accessibilityHint={minimumDate ? String(minimumDate.getTime()) : ""} onPress={() => onChange({ type: "set" }, new Date(2026, 6, 10, 0, 30))}>
      <Text>피커 선택</Text>
    </Pressable>
  );
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

describe("DateField", () => {
  it("선택한 로컬 날짜를 YYYY-MM-DD 키로 전달한다 (UTC로 자르지 않는다)", async () => {
    const onChange = jest.fn();
    await render(<DateField label="반복 종료일" value={null} onChange={onChange} />);
    await fireEvent.press(screen.getByRole("button", { name: /반복 종료일/ }));
    await fireEvent.press(await screen.findByText("피커 선택"));
    await fireEvent.press(screen.getByText("확인"));
    expect(onChange).toHaveBeenCalledWith("2026-07-10");
  });

  it("minimumDate를 로컬 자정 Date로 iOS 피커에 넘긴다", async () => {
    await render(<DateField label="시작일" value={null} onChange={jest.fn()} minimumDate="2026-11-20" />);
    await fireEvent.press(screen.getByRole("button", { name: /시작일/ }));
    const picker = await screen.findByTestId("picker");
    expect(picker.props.accessibilityHint).toBe(String(new Date(2026, 10, 20).getTime()));
  });

  it("minimumDate를 Android 다이얼로그에도 넘긴다", async () => {
    const RN = require("react-native");
    const original = RN.Platform.OS;
    RN.Platform.OS = "android";
    try {
      const { DateTimePickerAndroid } = require("@react-native-community/datetimepicker");
      await render(<DateField label="시작일" value={null} onChange={jest.fn()} minimumDate="2026-11-20" />);
      await fireEvent.press(screen.getByRole("button", { name: /시작일/ }));
      expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(
        expect.objectContaining({ minimumDate: new Date(2026, 10, 20) }),
      );
    } finally {
      RN.Platform.OS = original;
    }
  });

  it("값이 있으면 표시하고 지우기는 null을 전달한다", async () => {
    const onChange = jest.fn();
    await render(<DateField label="반복 종료일" value="2026-12-31" onChange={onChange} />);
    expect(screen.getByText("2026-12-31")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("반복 종료일 지우기"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("값이 없으면 안내 문구와 접근성 이름에 선택 안 함이 보인다", async () => {
    await render(<DateField label="반복 종료일" value={null} onChange={jest.fn()} />);
    expect(screen.getByText("날짜 선택")).toBeTruthy();
    expect(screen.getByLabelText("반복 종료일, 선택 안 함")).toBeTruthy();
  });

  it("지우기 버튼의 터치 영역(박스+hitSlop)은 양 축 모두 MIN_TOUCH_TARGET 이상이다", async () => {
    await render(<DateField label="반복 종료일" value="2026-12-31" onChange={jest.fn()} />);
    const clear = screen.getByLabelText("반복 종료일 지우기");
    const { width, height } = StyleSheet.flatten(clear.props.style);
    const slop = clear.props.hitSlop as number;
    expect(width + slop * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(height + slop * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});

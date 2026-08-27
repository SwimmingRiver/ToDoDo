import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  // lucide-react-native 아이콘은 RN testID가 아니라 웹 관례인 data-testid만
  // SVG에 설정한다(node_modules/lucide-react-native/dist/cjs/Icon.js 확인됨) —
  // @testing-library/react-native의 getByTestId로 못 찾는다. accessibilityState로
  // 검증한다.
  it("checked=false면 접근성 상태가 checked:false다", async () => {
    await render(<Checkbox checked={false} onPress={jest.fn()} accessibilityLabel="완료 처리" />);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(false);
  });

  it("checked=true면 접근성 상태가 checked:true다", async () => {
    await render(<Checkbox checked={true} onPress={jest.fn()} accessibilityLabel="완료 처리" />);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
  });

  it("탭하면 onPress가 호출된다", async () => {
    const onPress = jest.fn();
    await render(<Checkbox checked={false} onPress={onPress} accessibilityLabel="완료 처리" />);
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

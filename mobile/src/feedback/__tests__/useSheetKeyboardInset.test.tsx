import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Keyboard, type KeyboardEvent, Platform } from "react-native";
import { useSheetKeyboardInset } from "../useSheetKeyboardInset";

type Handler = (event: KeyboardEvent) => void;

const keyboardEvent = (screenY: number): KeyboardEvent =>
  ({
    duration: 250,
    easing: "keyboard",
    endCoordinates: { screenX: 0, screenY, width: 393, height: 852 - screenY },
  }) as KeyboardEvent;

describe("useSheetKeyboardInset", () => {
  const handlers: Record<string, Handler> = {};
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = "ios";
    jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, handler: Handler) => {
      handlers[name] = handler;
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  // pageSheet 모달은 화면 맨 위가 아니라 아래로 내려온 위치에서 시작한다. 부모 기준 onLayout
  // 좌표를 쓰는 KeyboardAvoidingView는 이 차이만큼 겹침을 적게 계산해 버튼이 키보드에 가려졌다.
  // 창(window) 좌표의 하단과 키보드 상단의 차이를 그대로 써야 한다.
  it("창 좌표 기준 하단과 키보드 상단의 차이만큼 인셋을 준다(시트 상단 오프셋 포함)", async () => {
    const { result } = await renderHook(() => useSheetKeyboardInset());
    // 시트가 y=62에서 시작하고 높이 756 → 창 기준 하단 818
    (result.current.ref as { current: unknown }).current = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 62, 393, 756),
    };

    await act(async () => handlers.keyboardWillChangeFrame(keyboardEvent(516)));
    expect(result.current.inset).toBe(818 - 516);

    await act(async () => handlers.keyboardWillHide(keyboardEvent(852)));
    expect(result.current.inset).toBe(0);
  });

  it("키보드가 컨테이너 하단보다 아래면 인셋은 0이다", async () => {
    const { result } = await renderHook(() => useSheetKeyboardInset());
    (result.current.ref as { current: unknown }).current = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 62, 393, 700),
    };

    await act(async () => handlers.keyboardWillChangeFrame(keyboardEvent(852)));
    expect(result.current.inset).toBe(0);
  });
});

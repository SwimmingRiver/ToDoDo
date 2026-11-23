import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Alert, Platform } from "react-native";

const mockIsAvailableAsync = jest.fn<() => Promise<boolean>>();
// 네이티브 버튼 대신 누를 수 있는 가짜 버튼
jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    isAvailableAsync: () => mockIsAvailableAsync(),
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Apple로 로그인" onPress={onPress}>
        <Text>Apple로 로그인</Text>
      </Pressable>
    ),
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  };
});
jest.mock("expo-crypto", () => ({}));
jest.mock("firebase/auth", () => ({}));
jest.mock("../../firebase", () => ({ auth: {} }));

const mockSignInWithGoogle = jest.fn<() => Promise<unknown>>();
jest.mock("../../auth/googleSignIn", () => ({ signInWithGoogle: () => mockSignInWithGoogle() }));

// 버튼 표시 조건(isAppleSignInAvailable)은 실제 코드를 쓴다.
const mockSignInWithApple = jest.fn<() => Promise<unknown>>();
jest.mock("../../auth/appleSignIn", () => ({
  ...jest.requireActual<Record<string, unknown>>("../../auth/appleSignIn"),
  signInWithApple: () => mockSignInWithApple(),
}));

const mockConsumeLinkedNotice = jest.fn<(user: unknown) => Promise<boolean>>();
jest.mock("../../auth/linkedNotice", () => ({ consumeLinkedNotice: (user: unknown) => mockConsumeLinkedNotice(user) }));

import { LoginScreen } from "../LoginScreen";

const HINT = "이전에 Google로 가입했다면 Google로 로그인해 주세요.";
const ACCOUNT_EXISTS = "이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요.";
const LINKED_NOTICE = "이제 Google·Apple 둘 다로 로그인할 수 있어요";

const renderScreen = async () => {
  await render(<LoginScreen />);
  // isAppleSignInAvailable 비동기 결과 반영
  await act(async () => {});
};

describe("LoginScreen", () => {
  let restorePlatform: { restore: () => void };
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

  beforeEach(() => {
    restorePlatform = jest.replaceProperty(Platform, "OS", "ios");
    mockIsAvailableAsync.mockReset().mockResolvedValue(true);
    mockSignInWithGoogle.mockReset().mockResolvedValue({ user: { uid: "u1" } });
    mockSignInWithApple.mockReset().mockResolvedValue({ user: { uid: "u1" } });
    mockConsumeLinkedNotice.mockReset().mockResolvedValue(false);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    restorePlatform.restore();
    alertSpy.mockRestore();
  });

  it("iOS에서 사용할 수 있으면 Apple 버튼과 안내 한 줄을 보인다", async () => {
    await renderScreen();
    expect(screen.getByRole("button", { name: "Apple로 로그인" })).toBeTruthy();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("Android에서는 Apple 버튼과 안내가 없다", async () => {
    restorePlatform.restore();
    restorePlatform = jest.replaceProperty(Platform, "OS", "android");
    await renderScreen();
    expect(screen.queryByRole("button", { name: "Apple로 로그인" })).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("기기가 Apple 로그인을 지원하지 않으면 버튼과 안내가 없다", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await renderScreen();
    expect(screen.queryByRole("button", { name: "Apple로 로그인" })).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("Apple 창을 닫으면 오류 문구를 띄우지 않는다", async () => {
    mockSignInWithApple.mockRejectedValue(Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }));
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Apple로 로그인" }));
    expect(screen.queryByText(/오류|실패|canceled/)).toBeNull();
  });

  it("다른 방법으로 가입된 이메일이면 충돌 문구를 띄운다", async () => {
    mockSignInWithApple.mockRejectedValue(
      Object.assign(new Error("exists"), { code: "auth/account-exists-with-different-credential" }),
    );
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Apple로 로그인" }));
    expect(screen.getByText(ACCOUNT_EXISTS)).toBeTruthy();
  });

  it("그 밖의 실패는 일반 오류 문구를 띄운다", async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error("network"));
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(screen.getByText("로그인 중 오류가 발생했습니다. 다시 시도해주세요.")).toBeTruthy();
  });

  it("두 방법이 처음 연결되면 Apple 로그인 뒤 안내 창을 한 번 띄운다", async () => {
    mockConsumeLinkedNotice.mockResolvedValue(true);
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Apple로 로그인" }));
    expect(mockConsumeLinkedNotice).toHaveBeenCalledWith({ uid: "u1" });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("로그인 방법 연결", LINKED_NOTICE);
  });

  it("구글 로그인 성공에도 같은 연결 안내를 띄운다", async () => {
    mockConsumeLinkedNotice.mockResolvedValue(true);
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("로그인 방법 연결", LINKED_NOTICE);
  });

  it("연결 안내가 필요 없으면 창을 띄우지 않는다", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

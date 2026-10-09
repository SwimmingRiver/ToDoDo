import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Alert, type AlertButton } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { email: "me@example.com" }, loading: false }),
}));

const mockSignOut = jest.fn<(client: QueryClient) => Promise<void>>();
jest.mock("../../auth/signOut", () => ({
  signOut: (client: QueryClient) => mockSignOut(client),
}));

const queryClient = new QueryClient();

const renderScreen = async () => {
  const { AccountScreen } = await import("../AccountScreen");
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );
};

/**
 * 마지막으로 띄운 Alert에서 label 버튼의 onPress를 누른다. waitForHandler=false면 핸들러가
 * 끝나기를 기다리지 않는다(끝나지 않는 signOut으로 "처리 중" 상태를 보는 테스트용).
 */
const pressAlertButton = async (
  alertSpy: jest.SpiedFunction<typeof Alert.alert>,
  label: string,
  waitForHandler = true,
) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  await act(async () => {
    const result = button?.onPress?.();
    if (waitForHandler) await result;
  });
};

describe("AccountScreen", () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

  beforeEach(() => {
    mockSignOut.mockReset().mockResolvedValue(undefined);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("로그인한 계정의 이메일을 보여준다", async () => {
    await renderScreen();

    expect(screen.getByText("me@example.com")).toBeTruthy();
  });

  it("로그아웃을 누르면 확인 창을 띄우고, 확인하면 signOut을 호출한다", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    expect(alertSpy).toHaveBeenCalledWith("로그아웃", "로그아웃할까요?", expect.any(Array));
    expect(mockSignOut).not.toHaveBeenCalled();

    await pressAlertButton(alertSpy, "로그아웃");

    expect(mockSignOut).toHaveBeenCalledWith(queryClient);
  });

  it("확인 창에서 취소하면 signOut을 호출하지 않는다", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    await pressAlertButton(alertSpy, "취소");

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signOut이 실패하면 안내 창을 띄우고 버튼을 다시 누를 수 있게 한다", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("network"));
    await renderScreen();

    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    await pressAlertButton(alertSpy, "로그아웃");

    expect(alertSpy).toHaveBeenLastCalledWith("로그아웃 실패", "잠시 후 다시 시도해주세요.");
    expect(screen.getByRole("button", { name: "로그아웃" }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it("로그아웃 처리 중에는 버튼이 비활성화된다", async () => {
    mockSignOut.mockReturnValueOnce(new Promise(() => {}));
    await renderScreen();

    await fireEvent.press(screen.getByRole("button", { name: "로그아웃" }));
    await pressAlertButton(alertSpy, "로그아웃", false);

    expect(screen.getByRole("button", { name: "로그아웃" }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

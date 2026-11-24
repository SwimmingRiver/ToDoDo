import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Alert, Platform, type AlertButton } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

let mockProviderIds: string[] = ["google.com"];
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({
    user: { email: "me@example.com", providerData: mockProviderIds.map((providerId) => ({ providerId })) },
    loading: false,
  }),
}));

// Apple 사용자 판별(isAppleUser)은 실제 코드를 쓰고, 네이티브·Firebase 모듈만 비운다.
jest.mock("expo-apple-authentication", () => ({}));
jest.mock("expo-crypto", () => ({}));
jest.mock("firebase/auth", () => ({}));
jest.mock("../../firebase", () => ({ auth: {} }));

const mockSignOut = jest.fn<(client: QueryClient, options?: { skipPushRelease?: boolean }) => Promise<void>>();
jest.mock("../../auth/signOut", () => ({
  signOut: (...args: [QueryClient, { skipPushRelease?: boolean }?]) => mockSignOut(...args),
}));

const mockReportError = jest.fn();
jest.mock("../../shared/lib/sentry", () => ({ reportError: (...args: unknown[]) => mockReportError(...args) }));

const mockDeleteAccount = jest.fn<() => Promise<void>>();
jest.mock("../../account/deleteAccount", () => ({
  deleteAccount: () => mockDeleteAccount(),
  AppleRevokeError: class AppleRevokeError extends Error {},
}));

import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";

let mockEntitlement: EntitlementDoc | undefined;
jest.mock("../../premium/useEntitlement", () => ({ useEntitlement: () => ({ data: mockEntitlement, isLoading: false }) }));
jest.mock("../../premium/PremiumSection", () => ({ PremiumSection: () => null }));
const mockManage = jest.fn<() => Promise<void>>();
jest.mock("../../premium/iap/purchaseClient", () => ({ purchaseClient: { openManageSubscriptions: () => mockManage() } }));

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
    mockEntitlement = undefined;
    mockProviderIds = ["google.com"];
    mockManage.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockDeleteAccount.mockReset().mockResolvedValue(undefined);
    mockReportError.mockReset();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("account has link to notifications", async () => {
    await renderScreen();
    fireEvent.press(screen.getByText("알림 설정"));
    expect(mockNavigate).toHaveBeenCalledWith("Notifications");
  });

  it("로그인한 계정의 이메일을 보여준다", async () => {
    await renderScreen();

    expect(screen.getByText("me@example.com")).toBeTruthy();
  });

  it("의견 보내기를 누르면 의견 모달이 열린다", async () => {
    await renderScreen();
    expect(screen.queryByPlaceholderText("불편한 점이나 바라는 기능을 자유롭게 적어주세요.")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "의견 보내기" }));

    expect(screen.getByPlaceholderText("불편한 점이나 바라는 기능을 자유롭게 적어주세요.")).toBeTruthy();
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

  describe("회원 탈퇴", () => {
    // 구독이 없으면 기본 문구만 나온다. Paddle 안내는 살아 있는 Paddle 기록이 있을 때만(웹 accountDeletionDialog와 같은 기준).
    const DELETE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
    const PADDLE_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";

    it("누르면 확인 창을 띄우고, 확인하면 탈퇴 후 로그아웃한다 — 구독이 없으면 기본 문구만", async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenCalledWith("회원 탈퇴", DELETE_MESSAGE, expect.any(Array));
      expect(mockDeleteAccount).not.toHaveBeenCalled();

      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      // 탈퇴가 이미 기기 토큰을 지웠다 — 삭제된 uid로 푸시 해제를 다시 하지 않는다.
      expect(mockSignOut).toHaveBeenCalledWith(queryClient, { skipPushRelease: true });
    });

    it("자동 갱신 스토어 구독이 있으면 경고를 덧붙이고 구독 관리 버튼을 낸다", async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: future,
        sources: { apple: { status: "active", premiumUntil: future, cancelAt: null, currentPeriodEnd: future, autoRenew: true,
          startedAt: null, updatedAt: future, originalTransactionId: "1", productId: "premium_monthly", environment: "Production",
          appAccountToken: null, lastNotificationUUID: null, lastSignedDate: null } },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenCalledWith(
        "회원 탈퇴",
        `${DELETE_MESSAGE}\n\nApp Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.`,
        expect.any(Array),
      );
      await pressAlertButton(alertSpy, "구독 관리");
      expect(mockManage).toHaveBeenCalled();
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it("Apple 결제 재시도(premiumUntil=지금, past_due, 자동 갱신)여도 경고를 덧붙인다", async () => {
      // 이용은 멈췄지만 App Store가 계속 청구를 시도한다 — 여기서 탈퇴하면 나중에 청구된다.
      const nowIso = new Date(Date.now()).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "free", status: "past_due", source: "apple", premiumUntil: nowIso,
        sources: { apple: { status: "past_due", premiumUntil: nowIso, cancelAt: null, currentPeriodEnd: nowIso, autoRenew: true,
          startedAt: null, updatedAt: nowIso, originalTransactionId: "1", productId: "premium_monthly", environment: "Production",
          appAccountToken: null, lastNotificationUUID: null, lastSignedDate: null } },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      // spyOn이 이전 테스트의 호출 기록을 이어받으므로 마지막 호출로 본다.
      expect(alertSpy).toHaveBeenLastCalledWith(
        "회원 탈퇴",
        `${DELETE_MESSAGE}\n\nApp Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.`,
        expect.any(Array),
      );
    });

    const googleRecord = (at: string) => ({
      status: "active" as const, premiumUntil: at, cancelAt: null, currentPeriodEnd: at, autoRenew: true,
      startedAt: null, updatedAt: at, purchaseToken: "t", productId: "premium_monthly", basePlanId: "monthly",
      environment: "Production" as const, obfuscatedAccountId: null, lastMessageId: null, lastEventTime: null,
    });
    const appleRecord = (at: string) => ({
      status: "active" as const, premiumUntil: at, cancelAt: null, currentPeriodEnd: at, autoRenew: true,
      startedAt: null, updatedAt: at, originalTransactionId: "1", productId: "premium_monthly", environment: "Production" as const,
      appAccountToken: null, lastNotificationUUID: null, lastSignedDate: null,
    });
    const buttonLabels = () =>
      (alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as AlertButton[]).map((button) => button.text);

    it('deletion dialog: auto-renewing google → "함께 해지돼요" notice, no "해지되지 않아요" warning', async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "google", premiumUntil: future,
        sources: { google: googleRecord(future) },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenLastCalledWith(
        "회원 탈퇴",
        `${DELETE_MESSAGE}\n\nGoogle Play 구독은 탈퇴하면 함께 해지돼요.`,
        expect.any(Array),
      );
      // 서버가 해지하므로 스토어 관리로 보낼 이유가 없다 — 구독 관리 버튼은 Apple일 때만.
      expect(buttonLabels()).toEqual(["취소", "탈퇴하기"]);
    });

    it("apple과 google이 둘 다 자동 갱신 중이면 Apple 경고와 Google 안내를 함께 보이고 구독 관리 버튼을 낸다", async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: future,
        sources: { apple: appleRecord(future), google: googleRecord(future) },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenLastCalledWith(
        "회원 탈퇴",
        `${DELETE_MESSAGE}\n\nApp Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.\n\nGoogle Play 구독은 탈퇴하면 함께 해지돼요.`,
        expect.any(Array),
      );
      expect(buttonLabels()).toEqual(["취소", "구독 관리", "탈퇴하기"]);
    });

    const paddleRecord = (status: "active" | "canceled") => ({
      status, premiumUntil: "2099-01-01T00:00:00.000Z", cancelAt: null, currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      autoRenew: true, startedAt: null, updatedAt: "2026-11-01T00:00:00.000Z", subscriptionId: "sub_1", customerId: "ctm_1",
      lastWebhookEventId: null, lastEventOccurredAt: null,
    });

    it("Paddle 구독이 살아 있으면 즉시 해지·환불 안내를 덧붙인다", async () => {
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "paddle", premiumUntil: "2099-01-01T00:00:00.000Z",
        sources: { paddle: paddleRecord("active") },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenLastCalledWith("회원 탈퇴", `${DELETE_MESSAGE}\n\n${PADDLE_NOTICE}`, expect.any(Array));
    });

    it("Paddle 기록이 canceled면 Paddle 안내를 띄우지 않는다", async () => {
      mockEntitlement = { ...EMPTY_ENTITLEMENT, sources: { paddle: paddleRecord("canceled") } };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenLastCalledWith("회원 탈퇴", DELETE_MESSAGE, expect.any(Array));
    });

    it("Apple 구독만 있으면 Paddle의 '구독이 즉시 해지되고' 안내를 띄우지 않는다", async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: future,
        sources: { apple: appleRecord(future) },
      };
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      const message = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][1];
      expect(message).not.toContain("구독이 즉시 해지되고");
    });

    it("Android에서는 Apple 구독이어도 구독 관리 버튼을 내지 않는다(Play 화면이 열리므로)", async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: future,
        sources: { apple: appleRecord(future) },
      };
      const restore = jest.replaceProperty(Platform, "OS", "android");
      try {
        await renderScreen();
        await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
        // 경고 문구는 그대로 — 다른 기기(iPhone)에서 해지해야 한다는 사실은 같다.
        expect(alertSpy).toHaveBeenLastCalledWith(
          "회원 탈퇴",
          `${DELETE_MESSAGE}\n\nApp Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.`,
          expect.any(Array),
        );
        expect(buttonLabels()).toEqual(["취소", "탈퇴하기"]);
      } finally {
        restore.restore();
      }
    });

    it("iOS에서는 Apple 구독이면 구독 관리 버튼을 낸다", async () => {
      const future = new Date(Date.now() + 30 * 864e5).toISOString();
      mockEntitlement = {
        ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: future,
        sources: { apple: appleRecord(future) },
      };
      const restore = jest.replaceProperty(Platform, "OS", "ios");
      try {
        await renderScreen();
        await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
        expect(buttonLabels()).toEqual(["취소", "구독 관리", "탈퇴하기"]);
      } finally {
        restore.restore();
      }
    });

    it("취소하면 아무것도 하지 않는다", async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "취소");

      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it("실패하면 안내 창을 띄우고 로그아웃하지 않으며 다시 누를 수 있다", async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy).toHaveBeenLastCalledWith("탈퇴 실패", "일부만 처리되었습니다. 다시 시도해 주세요.");
      expect(mockReportError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), "auth");
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "회원 탈퇴" }).props.accessibilityState).toMatchObject({ disabled: false });
    });

    it("Apple 로그인 사용자에게는 확인 창이 한 번 더 열린다고 알린다", async () => {
      mockProviderIds = ["apple.com"];
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenLastCalledWith(
        "회원 탈퇴",
        `${DELETE_MESSAGE}\n\nApple 계정 확인 창이 한 번 더 열려요.`,
        expect.any(Array),
      );
    });

    it("Android에서는 Apple 연결 계정이어도 확인 창 안내를 붙이지 않는다", async () => {
      mockProviderIds = ["apple.com", "google.com"];
      const restore = jest.replaceProperty(Platform, "OS", "android");
      try {
        await renderScreen();
        await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
        expect(alertSpy).toHaveBeenLastCalledWith("회원 탈퇴", DELETE_MESSAGE, expect.any(Array));
      } finally {
        restore.restore();
      }
    });

    it("Apple 확인 창을 닫으면 실패 안내 없이 원래 상태로 돌아간다", async () => {
      mockProviderIds = ["apple.com"];
      mockDeleteAccount.mockRejectedValueOnce(Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      const callsBefore = alertSpy.mock.calls.length;
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy.mock.calls.length).toBe(callsBefore);
      expect(mockReportError).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "회원 탈퇴" }).props.accessibilityState).toMatchObject({ disabled: false });
    });

    it("Apple 해지 단계에서 실패하면 아무것도 지워지지 않았다고 알린다", async () => {
      mockProviderIds = ["apple.com"];
      const { AppleRevokeError } = await import("../../account/deleteAccount");
      mockDeleteAccount.mockRejectedValueOnce(new AppleRevokeError("revoke"));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy).toHaveBeenLastCalledWith("탈퇴 실패", "Apple 확인에 실패해 아무것도 삭제되지 않았어요. 다시 시도해 주세요.");
      expect(mockReportError).toHaveBeenCalledWith(expect.any(AppleRevokeError), "auth");
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("처리 중에는 탈퇴·로그아웃 버튼이 모두 비활성화된다", async () => {
      mockDeleteAccount.mockReturnValueOnce(new Promise(() => {}));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기", false);

      expect(screen.getByRole("button", { name: "회원 탈퇴" }).props.accessibilityState).toMatchObject({ disabled: true });
      expect(screen.getByRole("button", { name: "로그아웃" }).props.accessibilityState).toMatchObject({ disabled: true });
    });

    it("탈퇴 후 로그아웃이 실패하면 앱을 다시 실행하라고 안내한다", async () => {
      mockSignOut.mockRejectedValueOnce(new Error("signout"));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy).toHaveBeenLastCalledWith("탈퇴 완료", "앱을 다시 실행해 주세요.");
    });
  });
});

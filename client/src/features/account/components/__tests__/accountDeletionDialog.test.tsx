import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupUser } from "@/test/setupUser";

const mockDeleteAccount = vi.fn<(onStep?: (step: "apple" | "calendar" | "reminders" | "account") => void) => Promise<void>>();
vi.mock("../../api/deleteAccount", () => ({
  deleteAccount: (onStep?: (step: "apple" | "calendar" | "reminders" | "account") => void) => mockDeleteAccount(onStep),
}));

const mockLogout = vi.fn(async () => undefined);
vi.mock("@/features/auth/context/useAuth", () => ({ useAuth: () => ({ logout: mockLogout }) }));

import type { Entitlement } from "@/features/entitlement/types";

let entitlement: Pick<Entitlement, "sources"> | undefined;
const record = {
  status: "active" as const,
  premiumUntil: "2099-01-01T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: null,
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const paddle = { ...record, customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: null, lastEventOccurredAt: null };
const apple = { ...record, originalTransactionId: "o1", productId: "p", environment: "Production" as const, appAccountToken: null, lastNotificationUUID: null, lastSignedDate: null };
const google = { ...record, purchaseToken: "t", productId: "p", basePlanId: null, environment: "Production" as const, obfuscatedAccountId: null, lastMessageId: null, lastEventTime: null };
vi.mock("@/features/entitlement", () => ({ useEntitlement: () => ({ data: entitlement }) }));

const mockSuccess = vi.fn();
vi.mock("@/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared")>()),
  useToast: () => ({ success: mockSuccess }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

const mockClearSnapshot = vi.fn();
vi.mock("@/features/calendarIntegration/hooks/syncSnapshot", () => ({ clearSnapshot: (uid: string) => mockClearSnapshot(uid) }));
const fakeAuth = { currentUser: { uid: "u1", providerData: [{ providerId: "google.com" }] } };
vi.mock("@/shared/lib/firebase", () => ({ auth: fakeAuth }));
const mockWarmUp = vi.fn();
vi.mock("@/features/auth/api/warmUpPopup", () => ({ warmUpPopupResolver: () => mockWarmUp() }));

const renderDialog = async (onClose = vi.fn()) => {
  const { default: AccountDeletionDialog } = await import("../accountDeletionDialog");
  const queryClient = new QueryClient();
  const clear = vi.spyOn(queryClient, "clear");
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDeletionDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, clear };
};

describe("AccountDeletionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlement = undefined;
    fakeAuth.currentUser.providerData = [{ providerId: "google.com" }];
    mockDeleteAccount.mockResolvedValue(undefined);
  });

  it("삭제 안내를 보여주고 구독이 없으면 구독 안내는 없다", async () => {
    await renderDialog();
    expect(screen.getByText(/할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/구독이 즉시 해지되고/)).not.toBeInTheDocument();
  });

  it("살아 있는 Paddle 구독이면 구독 해지·환불 안내를 덧붙인다", async () => {
    entitlement = { sources: { paddle } };
    await renderDialog();
    expect(
      screen.getByText(/구독이 즉시 해지되고 남은 기간은 사라집니다\. 결제 14일 이내라면 환불을 요청할 수 있습니다\./),
    ).toBeInTheDocument();
  });

  it("취소된 Paddle 구독이면 구독 안내가 없다", async () => {
    entitlement = { sources: { paddle: { ...paddle, status: "canceled" } } };
    await renderDialog();
    expect(screen.queryByText(/구독이 즉시 해지되고/)).not.toBeInTheDocument();
  });

  it("자동 갱신 중인 apple 구독이면 App Store 경고를 덧붙인다", async () => {
    entitlement = { sources: { apple } };
    await renderDialog();
    expect(screen.getByText(/App Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요\. 먼저 구독을 해지해 주세요\./)).toBeInTheDocument();
    expect(screen.queryByText(/함께 해지돼요/)).not.toBeInTheDocument();
  });

  it("deletion dialog: auto-renewing google → \"함께 해지돼요\" notice, no \"해지되지 않아요\" warning", async () => {
    entitlement = { sources: { paddle, google } };
    await renderDialog();
    expect(screen.getByText(/Google Play 구독은 탈퇴하면 함께 해지돼요/)).toBeInTheDocument();
    expect(screen.queryByText(/해지되지 않/)).not.toBeInTheDocument();
    expect(screen.getByText(/구독이 즉시 해지되고/)).toBeInTheDocument();
  });

  it("apple과 google이 둘 다 자동 갱신 중이면 Apple 경고와 Google 안내를 함께 보인다", async () => {
    entitlement = { sources: { apple, google } };
    await renderDialog();
    expect(screen.getByText(/App Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요\. 먼저 구독을 해지해 주세요\./)).toBeInTheDocument();
    expect(screen.getByText(/Google Play 구독은 탈퇴하면 함께 해지돼요/)).toBeInTheDocument();
  });

  it("해지 예약된 google 구독이면 함께 해지 안내도 없다", async () => {
    entitlement = { sources: { google: { ...google, cancelAt: "2099-01-01T00:00:00.000Z", autoRenew: false } } };
    await renderDialog();
    expect(screen.queryByText(/함께 해지돼요/)).not.toBeInTheDocument();
  });

  it("결제 재시도·보류(premiumUntil=지금, past_due, 자동 갱신)여도 스토어 경고를 덧붙인다", async () => {
    // 이용은 멈췄지만 스토어가 계속 청구를 시도한다 — 여기서 탈퇴하면 나중에 청구된다.
    const nowIso = new Date().toISOString();
    entitlement = { sources: { apple: { ...apple, status: "past_due", premiumUntil: nowIso } } };
    await renderDialog();
    expect(screen.getByText(/App Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요\. 먼저 구독을 해지해 주세요\./)).toBeInTheDocument();
  });

  it("해지 예약된 스토어 구독이면 경고가 없다", async () => {
    entitlement = { sources: { apple: { ...apple, cancelAt: "2099-01-01T00:00:00.000Z", autoRenew: false } } };
    await renderDialog();
    expect(screen.queryByText(/해지되지 않고/)).not.toBeInTheDocument();
  });

  it("탈퇴하기를 누르면 삭제 → 스냅샷 정리 → 로그아웃 → 캐시 비움 → 홈 이동 + 토스트", async () => {
    const user = setupUser();
    const { clear } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith("탈퇴가 완료되었습니다"));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearSnapshot).toHaveBeenCalledWith("u1");
    expect(mockLogout).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("진행 중에는 버튼이 비활성이고 취소로 닫히지 않으며 두 번 호출되지 않는다", async () => {
    mockDeleteAccount.mockReturnValue(new Promise(() => {}));
    const user = setupUser();
    const { onClose } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    const pending = screen.getByRole("button", { name: "탈퇴 처리 중…" });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("실패하면 실패 안내를 보여주고 다시 시도할 수 있다(로그아웃하지 않음)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
    const user = setupUser();
    await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    expect(await screen.findByText(/일부만 처리되었습니다\. 다시 시도해 주세요\./)).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(2));
  });

  it("서버 삭제 뒤 logout이 거부돼도 로그만 남기고 캐시 비움·홈 이동·토스트는 끝까지 진행한다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockLogout.mockRejectedValueOnce(new Error("signOut failed"));
    const user = setupUser();
    const { clear } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith("탈퇴가 완료되었습니다"));
    expect(consoleError).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("취소를 누르면 onClose", async () => {
    const user = setupUser();
    const { onClose } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalled();
  });
  describe("Apple 로그인 사용자", () => {
    const NOTICE = /Apple 계정 확인 창이 한 번 더 열려요\./;

    it("재인증 안내를 보여주고, 구글 사용자에게는 보이지 않는다", async () => {
      fakeAuth.currentUser.providerData = [{ providerId: "apple.com" }];
      const { unmount } = await renderDialog().then((r) => ({ ...r, unmount: () => document.body.replaceChildren() }));
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
      unmount();
      fakeAuth.currentUser.providerData = [{ providerId: "google.com" }];
      await renderDialog();
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    });

    it("진행 중 apple 단계 문구를 보여준다", async () => {
      mockDeleteAccount.mockImplementation((onStep) => {
        onStep?.("apple");
        return new Promise(() => {});
      });
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
      expect(screen.getByRole("status")).toHaveTextContent("Apple 연결 해제 중…");
    });

    it("재인증 창을 닫으면 실패 문구 없이 원래 상태로 돌아간다", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockDeleteAccount.mockRejectedValueOnce(Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" }));
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "탈퇴하기" })).toBeEnabled());
      expect(screen.queryByText(/일부만 처리되었습니다/)).not.toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it("apple 단계에서 실패하면 아무것도 삭제되지 않았다고 알린다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockDeleteAccount.mockImplementationOnce(async (onStep) => {
        onStep?.("apple");
        throw new Error("revoke");
      });
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

      expect(
        await screen.findByText(/Apple 확인에 실패해 아무것도 삭제되지 않았어요\. 다시 시도해 주세요\./),
      ).toBeInTheDocument();
      expect(screen.queryByText(/일부만 처리되었습니다/)).not.toBeInTheDocument();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it("apple 다음 단계에서 실패하면 기존 실패 문구를 보여준다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockDeleteAccount.mockImplementationOnce(async (onStep) => {
        onStep?.("apple");
        onStep?.("calendar");
        throw new Error("calendar");
      });
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

      expect(await screen.findByText(/일부만 처리되었습니다\. 다시 시도해 주세요\./)).toBeInTheDocument();
      expect(screen.queryByText(/Apple 확인에 실패해/)).not.toBeInTheDocument();
    });
  });

  describe("진행 표시", () => {
    it("진행 중에는 현재 단계와 '창을 닫지 마세요' 안내를 보여주고, 단계가 바뀌면 갱신한다", async () => {
      let reportStep: ((step: "apple" | "calendar" | "reminders" | "account") => void) | undefined;
      mockDeleteAccount.mockImplementation((onStep) => {
        reportStep = onStep;
        onStep?.("calendar");
        return new Promise(() => {});
      });
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("구글 캘린더 연동 해제 중…");
      expect(status).toHaveTextContent("완료될 때까지 창을 닫지 마세요");

      act(() => reportStep?.("reminders"));
      expect(screen.getByRole("status")).toHaveTextContent("알림 정리 중…");
      act(() => reportStep?.("account"));
      expect(screen.getByRole("status")).toHaveTextContent("계정과 데이터 삭제 중…");
    });

    it("진행 중에는 취소 버튼도 비활성이다", async () => {
      mockDeleteAccount.mockReturnValue(new Promise(() => {}));
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
      expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    });

    it("진행 전과 실패 후에는 진행 표시가 없다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
      const user = setupUser();
      await renderDialog();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
      await screen.findByText(/일부만 처리되었습니다/);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("탭 닫기 경고(beforeunload)", () => {
    const fireBeforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event;
    };

    it("진행 중에만 페이지 이탈을 막는다", async () => {
      mockDeleteAccount.mockReturnValue(new Promise(() => {}));
      const user = setupUser();
      await renderDialog();
      expect(fireBeforeUnload().defaultPrevented).toBe(false);

      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
      expect(fireBeforeUnload().defaultPrevented).toBe(true);
    });

    it("실패해서 진행이 끝나면 다시 막지 않는다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
      const user = setupUser();
      await renderDialog();
      await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
      await screen.findByText(/일부만 처리되었습니다/);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
    });
  });

  it("Apple 사용자면 열릴 때 팝업 처리기를 미리 준비한다(Safari 첫 팝업 차단 방지)", async () => {
    fakeAuth.currentUser.providerData = [{ providerId: "apple.com" }];
    await renderDialog();
    expect(mockWarmUp).toHaveBeenCalledTimes(1);
  });

  it("구글 사용자면 팝업 처리기를 준비하지 않는다", async () => {
    await renderDialog();
    expect(mockWarmUp).not.toHaveBeenCalled();
  });

  it("Apple 확인 창이 차단되면 아무것도 지워지지 않았다며 한 번 더 누르라고 안내한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeAuth.currentUser.providerData = [{ providerId: "apple.com" }];
    mockDeleteAccount.mockImplementationOnce(async (onStep) => {
      onStep?.("apple");
      throw { code: "auth/popup-blocked" };
    });
    const user = setupUser();
    await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
    expect(
      await screen.findByText(/Apple 확인 창이 열리지 않았어요\. 아무것도 삭제되지 않았으니 한 번 더 눌러 주세요\./),
    ).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

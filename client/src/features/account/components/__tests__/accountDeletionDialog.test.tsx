import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupUser } from "@/test/setupUser";

const mockDeleteAccount = vi.fn<(onStep?: (step: "calendar" | "reminders" | "account") => void) => Promise<void>>();
vi.mock("../../api/deleteAccount", () => ({
  deleteAccount: (onStep?: (step: "calendar" | "reminders" | "account") => void) => mockDeleteAccount(onStep),
}));

const mockLogout = vi.fn(async () => undefined);
vi.mock("@/features/auth/context/useAuth", () => ({ useAuth: () => ({ logout: mockLogout }) }));

let entitlement: { source: string | null; status: string } | undefined;
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
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u1" } } }));

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
    mockDeleteAccount.mockResolvedValue(undefined);
  });

  it("삭제 안내를 보여주고 구독이 없으면 구독 안내는 없다", async () => {
    await renderDialog();
    expect(screen.getByText(/할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/구독이 즉시 해지되고/)).not.toBeInTheDocument();
  });

  it("살아 있는 Paddle 구독이면 구독 해지·환불 안내를 덧붙인다", async () => {
    entitlement = { source: "paddle", status: "active" };
    await renderDialog();
    expect(
      screen.getByText(/구독이 즉시 해지되고 남은 기간은 사라집니다\. 결제 14일 이내라면 환불을 요청할 수 있습니다\./),
    ).toBeInTheDocument();
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
  describe("진행 표시", () => {
    it("진행 중에는 현재 단계와 '창을 닫지 마세요' 안내를 보여주고, 단계가 바뀌면 갱신한다", async () => {
      let reportStep: ((step: "calendar" | "reminders" | "account") => void) | undefined;
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
});

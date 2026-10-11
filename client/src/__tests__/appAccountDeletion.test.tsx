import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import App from "../App";

// App의 부수 효과 훅·무거운 자식은 걷어내고, 드로어 → 프로필 메뉴 → 탈퇴 창 경로만 실물로 둔다.
vi.mock("@/features/todo/hooks", () => ({ useRunStartupMaintenance: () => ({ mutate: vi.fn() }) }));
vi.mock("@/features/todo/utils/startupMaintenanceGate", () => ({ claimStartupMaintenance: () => false }));
vi.mock("@/features/calendarIntegration/hooks", () => ({ useSyncTodosToCalendar: () => undefined }));
vi.mock("@/features/reminders/hooks/useReminderRefresh", () => ({ useReminderRefresh: () => undefined }));
vi.mock("@/features/reminders/hooks/usePushTokenSync", () => ({ usePushTokenSync: () => undefined }));
vi.mock("@/features/reminders/hooks/useForegroundReminders", () => ({ useForegroundReminders: () => undefined }));
vi.mock("@/features/reminders/hooks/useNotificationClickNavigation", () => ({
  useNotificationClickNavigation: () => undefined,
}));
vi.mock("@/features/entitlement/hooks/useEntitlementSync", () => ({ useEntitlementSync: () => undefined }));
vi.mock("@/features/reminders/components/reminderPrompt/reminderPrompt", () => ({
  ReminderPromptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/feedback/components/feedbackForm", () => ({ default: () => null }));
vi.mock("@/shared/hooks", () => ({ useMediaQuery: () => true }));
vi.mock("@/layouts/header/header", () => ({ default: () => null }));
vi.mock("@/layouts/snb/snb",() => ({ default: () => null }));
vi.mock("@/layouts/footer/footer", () => ({ default: () => null }));
vi.mock("@/layouts/bottomTabBar/bottomTabBar", () => ({ default: () => null }));
vi.mock("@/layouts/bottomTabBar/bottomTabBar.styles", () => ({ BOTTOM_TAB_BAR_HEIGHT: 0 }));
vi.mock("@/layouts/mobileHeader/mobileHeader", () => ({
  default: ({ onAvatarClick }: { onAvatarClick: () => void }) => (
    <button type="button" onClick={onAvatarClick}>
      아바타
    </button>
  ),
}));
vi.mock("@/features/auth/context/useAuth", () => ({
  useAuth: () => ({ user: { uid: "u1", displayName: "강수영", photoURL: "" }, logout: vi.fn() }),
}));
vi.mock("@/features/account", () => ({
  AccountDeletionDialog: () => <div role="dialog" aria-label="회원 탈퇴 확인" />,
}));

describe("App의 회원 탈퇴 창 수명", () => {
  it("모바일 드로어에서 회원 탈퇴를 요청하면 드로어가 닫혀도 탈퇴 창은 남아 있다", async () => {
    const user = setupUser();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByText("아바타"));
    await user.click(screen.getByText("강수영"));
    await user.click(screen.getByText("회원 탈퇴"));

    // 드로어가 스스로 닫힌다(언마운트까지 기다린다)
    await waitFor(() => expect(screen.queryByText("의견 보내기")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "회원 탈퇴 확인" })).toBeInTheDocument();
  });
});

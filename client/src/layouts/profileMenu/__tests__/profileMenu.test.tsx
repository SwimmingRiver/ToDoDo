import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setupUser } from "@/test/setupUser";
import ProfileMenu from "../profileMenu";

const logout = vi.fn();

vi.mock("@/features/auth/context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "강수영", photoURL: "" },
    logout,
  }),
}));

vi.mock("@/features/account", () => ({
  AccountDeletionDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="회원 탈퇴 확인">
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));

describe("ProfileMenu 컴포넌트", () => {
  it("트리거를 클릭하기 전에는 메뉴 항목이 보이지 않아야 한다", () => {
    render(<ProfileMenu>프로필</ProfileMenu>);

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
  });

  it("트리거를 클릭하면 로그아웃 항목이 있는 메뉴가 열려야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));

    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });

  it("메뉴 제목은 사용자의 displayName을 보여줘야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));

    expect(screen.getByText("강수영")).toBeInTheDocument();
  });

  it("로그아웃 항목을 클릭하면 logout이 호출되어야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("로그아웃"));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("회원 탈퇴를 누르면 메뉴가 닫히고 탈퇴 확인 창이 열린다", async () => {
    logout.mockClear();
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("회원 탈퇴"));

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "회원 탈퇴 확인" })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("탈퇴 확인 창을 닫으면 사라진다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("회원 탈퇴"));
    await user.click(screen.getByText("닫기"));

    expect(screen.queryByRole("dialog", { name: "회원 탈퇴 확인" })).not.toBeInTheDocument();
  });
});

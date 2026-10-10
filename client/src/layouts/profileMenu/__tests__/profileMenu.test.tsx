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

describe("ProfileMenu 컴포넌트", () => {
  it("트리거를 클릭하기 전에는 메뉴 항목이 보이지 않아야 한다", () => {
    render(<ProfileMenu onDeleteAccountClick={vi.fn()}>프로필</ProfileMenu>);

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
  });

  it("트리거를 클릭하면 로그아웃 항목이 있는 메뉴가 열려야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu onDeleteAccountClick={vi.fn()}>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));

    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });

  it("메뉴 제목은 사용자의 displayName을 보여줘야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu onDeleteAccountClick={vi.fn()}>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));

    expect(screen.getByText("강수영")).toBeInTheDocument();
  });

  it("로그아웃 항목을 클릭하면 logout이 호출되어야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu onDeleteAccountClick={vi.fn()}>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("로그아웃"));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("회원 탈퇴를 누르면 메뉴가 닫히고 탈퇴 창을 열어 달라고 요청만 한다", async () => {
    logout.mockClear();
    const onDeleteAccountClick = vi.fn();
    const user = setupUser();
    render(<ProfileMenu onDeleteAccountClick={onDeleteAccountClick}>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("회원 탈퇴"));

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
    expect(onDeleteAccountClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});

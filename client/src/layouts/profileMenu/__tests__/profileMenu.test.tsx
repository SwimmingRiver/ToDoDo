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
});

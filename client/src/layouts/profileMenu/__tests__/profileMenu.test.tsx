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

// FeedbackButton은 실제로 임포트하면 feedbackApi.ts를 거쳐 Firebase를 초기화한다.
// ProfileMenu 테스트는 "의견 보내기 행을 누르면 메뉴가 닫힌다"만 확인하면 되므로,
// 자리표시자 버튼으로 대체해 Firebase 의존을 끊는다.
vi.mock("@/features/feedback/components/feedbackButton", () => ({
  default: () => <button>의견 보내기</button>,
}));

describe("ProfileMenu 컴포넌트", () => {
  it("트리거를 클릭하기 전에는 메뉴 항목이 보이지 않아야 한다", () => {
    render(<ProfileMenu>프로필</ProfileMenu>);

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
  });

  it("트리거를 클릭하면 의견 보내기/로그아웃 항목이 있는 메뉴가 열려야 한다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));

    expect(screen.getByText("의견 보내기")).toBeInTheDocument();
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

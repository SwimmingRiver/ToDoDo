import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import MobileDrawer from "../mobileDrawer";

vi.mock("@/features/auth/context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "강수영", photoURL: "https://example.com/avatar.png" },
    logout: vi.fn(),
  }),
}));

const renderDrawer = (props?: {
  onClose?: () => void;
  onFeedbackClick?: () => void;
  onDeleteAccountClick?: () => void;
}) =>
  render(
    <MemoryRouter>
      <MobileDrawer
        isOpen
        onClose={props?.onClose ?? vi.fn()}
        onFeedbackClick={props?.onFeedbackClick ?? vi.fn()}
        onDeleteAccountClick={props?.onDeleteAccountClick ?? vi.fn()}
      />
    </MemoryRouter>
  );

describe("MobileDrawer 안 ProfileMenu 스태킹", () => {
  it("드로어가 열린 상태에서 프로필 메뉴를 열면, 메뉴가 드로어 패널보다 위에 있어야 한다", async () => {
    // 드로어(z-index 9999)와 프로필 메뉴가 여는 BottomSheet(공유 컴포넌트)가 둘 다
    // document.body에 portal되므로, 화면에 실제로 보이는 건 두 z-index 중 더 큰
    // 쪽이다. BottomSheet가 드로어보다 낮으면 메뉴를 열어도 드로어 패널에 가려
    // 보이지 않는다 — 실제로 한 번 이렇게 깨졌던 적이 있다.
    const user = setupUser();
    const { container } = renderDrawer();

    await user.click(screen.getByText("강수영"));

    const bodyChildren = Array.from(document.body.children).filter(
      (el) => el !== container
    ) as HTMLElement[];
    const zIndexOf = (el: HTMLElement) => Number(getComputedStyle(el).zIndex) || 0;
    const topmost = bodyChildren.reduce((a, b) => (zIndexOf(b) > zIndexOf(a) ? b : a));

    expect(topmost.textContent).toContain("로그아웃");
  });
});

describe("MobileDrawer 안 의견 보내기", () => {
  it("맨 하단에 의견 보내기 트리거가 있어야 한다", () => {
    renderDrawer();

    expect(screen.getByText("의견 보내기")).toBeInTheDocument();
  });

  it("클릭하면 onFeedbackClick이 호출되고 드로어가 닫혀야 한다", async () => {
    // FeedbackForm 자체는 드로어 밖(App)에서 렌더링되므로 여기서는 드로어가
    // "닫힘 신호(onFeedbackClick)를 보내고 스스로도 닫히는지"만 검증한다.
    const onFeedbackClick = vi.fn();
    const onClose = vi.fn();
    const user = setupUser();
    renderDrawer({ onClose, onFeedbackClick });

    await user.click(screen.getByText("의견 보내기"));

    expect(onFeedbackClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("MobileDrawer 안 회원 탈퇴", () => {
  it("프로필 메뉴에서 회원 탈퇴를 누르면 onDeleteAccountClick이 호출되고 드로어가 닫혀야 한다", async () => {
    const onDeleteAccountClick = vi.fn();
    const onClose = vi.fn();
    const user = setupUser();
    renderDrawer({ onClose, onDeleteAccountClick });

    await user.click(screen.getByText("강수영"));
    await user.click(screen.getByText("회원 탈퇴"));

    expect(onDeleteAccountClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("MobileDrawer 법적 링크", () => {
  it("이용약관을 누르면 드로어를 닫는다", async () => {
    const user = setupUser();
    const onClose = vi.fn();
    renderDrawer({ onClose });

    const link = screen.getByRole("link", { name: "이용약관" });
    expect(link).toHaveAttribute("href", "/terms");
    await user.click(link);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

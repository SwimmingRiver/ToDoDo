import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import MobileDrawer from "../mobileDrawer";

vi.mock("@/features/auth/context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "강수영", photoURL: "https://example.com/avatar.png" },
    logout: vi.fn(),
  }),
}));

// ProfileMenu가 내부에서 FeedbackButton을 렌더링하는데, 그걸 실제로 임포트하면
// feedbackApi.ts를 거쳐 Firebase를 초기화한다. 이 테스트는 z-index 스태킹만
// 확인하면 되므로 자리표시자로 대체한다.
vi.mock("@/features/feedback/components/feedbackButton", () => ({
  default: () => <button>의견 보내기</button>,
}));

describe("MobileDrawer 안 ProfileMenu 스태킹", () => {
  it("드로어가 열린 상태에서 프로필 메뉴를 열면, 메뉴가 드로어 패널보다 위에 있어야 한다", async () => {
    // 드로어(z-index 9999)와 프로필 메뉴가 여는 BottomSheet(공유 컴포넌트)가 둘 다
    // document.body에 portal되므로, 화면에 실제로 보이는 건 두 z-index 중 더 큰
    // 쪽이다. BottomSheet가 드로어보다 낮으면 메뉴를 열어도 드로어 패널에 가려
    // 보이지 않는다 — 실제로 한 번 이렇게 깨졌던 적이 있다.
    const user = setupUser();
    const { container } = render(
      <MemoryRouter>
        <MobileDrawer isOpen onClose={vi.fn()} />
      </MemoryRouter>
    );

    await user.click(screen.getByText("강수영"));

    const bodyChildren = Array.from(document.body.children).filter(
      (el) => el !== container
    ) as HTMLElement[];
    const zIndexOf = (el: HTMLElement) => Number(getComputedStyle(el).zIndex) || 0;
    const topmost = bodyChildren.reduce((a, b) => (zIndexOf(b) > zIndexOf(a) ? b : a));

    expect(topmost.textContent).toContain("로그아웃");
  });
});

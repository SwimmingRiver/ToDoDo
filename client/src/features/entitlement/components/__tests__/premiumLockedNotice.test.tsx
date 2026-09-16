import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PremiumLockedNotice from "../premiumLockedNotice";

describe("PremiumLockedNotice", () => {
  it("title/description을 렌더링한다", () => {
    render(<PremiumLockedNotice title="프리미엄 기능" description="구독하면 이용 가능합니다" />);

    expect(screen.getByText("프리미엄 기능")).toBeInTheDocument();
    expect(screen.getByText("구독하면 이용 가능합니다")).toBeInTheDocument();
  });

  it("ctaLabel과 onCtaClick이 모두 있을 때만 CTA 버튼을 렌더링하고 클릭 시 호출한다", () => {
    const onCtaClick = vi.fn();
    render(
      <PremiumLockedNotice
        title="프리미엄 기능"
        description="구독하면 이용 가능합니다"
        ctaLabel="문의하기"
        onCtaClick={onCtaClick}
      />,
    );

    const button = screen.getByRole("button", { name: "문의하기" });
    fireEvent.click(button);
    expect(onCtaClick).toHaveBeenCalledTimes(1);
  });

  it("ctaLabel이 없으면 CTA 버튼을 렌더링하지 않는다", () => {
    render(<PremiumLockedNotice title="프리미엄 기능" description="구독하면 이용 가능합니다" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("compact가 true면 description을 렌더링하지 않는다 (좁은 툴바용)", () => {
    render(
      <PremiumLockedNotice
        compact
        title="프리미엄 기능"
        description="구독하면 이용 가능합니다"
        ctaLabel="관심 있어요"
        onCtaClick={() => {}}
      />,
    );

    expect(screen.getByText("프리미엄 기능")).toBeInTheDocument();
    expect(screen.queryByText("구독하면 이용 가능합니다")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "관심 있어요" })).toBeInTheDocument();
  });
});

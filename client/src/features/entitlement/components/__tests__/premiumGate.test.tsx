import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PremiumGate from "../premiumGate";

describe("PremiumGate", () => {
  it("isPremium이 true면 children을 렌더링한다", () => {
    render(
      <PremiumGate isPremium fallback={<div>잠김</div>}>
        <div>프리미엄 콘텐츠</div>
      </PremiumGate>,
    );

    expect(screen.getByText("프리미엄 콘텐츠")).toBeInTheDocument();
    expect(screen.queryByText("잠김")).not.toBeInTheDocument();
  });

  it("isPremium이 false면 fallback을 렌더링한다", () => {
    render(
      <PremiumGate isPremium={false} fallback={<div>잠김</div>}>
        <div>프리미엄 콘텐츠</div>
      </PremiumGate>,
    );

    expect(screen.getByText("잠김")).toBeInTheDocument();
    expect(screen.queryByText("프리미엄 콘텐츠")).not.toBeInTheDocument();
  });

  it("isLoading이면 isPremium 값과 무관하게 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <PremiumGate isPremium isLoading fallback={<div>잠김</div>}>
        <div>프리미엄 콘텐츠</div>
      </PremiumGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

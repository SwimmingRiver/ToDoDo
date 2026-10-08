import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import { PREMIUM_BENEFITS, PREMIUM_MONTHLY_PRICE_LABEL } from "@/features/billing/config";
import PricingSection from "../pricingSection";

const renderSection = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<PricingSection />} />
        <Route path="/login" element={<div>로그인 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("PricingSection", () => {
  it("#pricing 앵커를 가진다", () => {
    const { container } = renderSection();
    expect(container.querySelector("section#pricing")).not.toBeNull();
  });

  it("프리미엄 카드는 공유 가격·혜택과 체험 조건을 보여준다", () => {
    renderSection();
    const premium = screen.getByRole("article", { name: "프리미엄" });
    expect(within(premium).getByText(PREMIUM_MONTHLY_PRICE_LABEL)).toBeInTheDocument();
    expect(within(premium).getByText("부가세 포함")).toBeInTheDocument();
    for (const { title } of PREMIUM_BENEFITS) {
      expect(within(premium).getByText(title)).toBeInTheDocument();
    }
    expect(within(premium).getByText("카드 등록 없이 · 계정당 1회")).toBeInTheDocument();
  });

  it("무료 카드는 0원과 무료 기능을 보여준다", () => {
    renderSection();
    const free = screen.getByRole("article", { name: "무료" });
    expect(within(free).getByText("0원")).toBeInTheDocument();
    expect(within(free).getByText("마감 알림")).toBeInTheDocument();
  });

  it.each(["무료로 시작하기", "7일 무료 체험 시작하기"])("%s 버튼은 /login으로 간다", async (name) => {
    const user = setupUser();
    renderSection();
    await user.click(screen.getByRole("button", { name }));
    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
  });

  it("환불 정책 링크와 Paddle 안내가 있다", () => {
    renderSection();
    expect(screen.getByRole("link", { name: "환불 정책" })).toHaveAttribute("href", "/refund");
    expect(screen.getByText("결제는 Paddle이 처리합니다")).toBeInTheDocument();
  });
});

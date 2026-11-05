import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "../footer";

const renderFooter = (props: { showBusinessInfo?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <Footer {...props} />
    </MemoryRouter>,
  );

describe("Footer", () => {
  it("이용약관·개인정보처리방침·환불 정책 링크가 있다", () => {
    renderFooter();
    const nav = screen.getByRole("navigation", { name: "약관 및 정책" });
    expect(within(nav).getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(within(nav).getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(within(nav).getByRole("link", { name: "환불 정책" })).toHaveAttribute("href", "/refund");
  });

  it("Contact는 법적 문서와 같은 문의 메일로 간다", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "mailto:dodonriver@gmail.com",
    );
  });

  it("기본(앱 안)에서는 사업자정보를 보여주지 않는다", () => {
    renderFooter();
    expect(screen.queryByRole("region", { name: "사업자정보" })).not.toBeInTheDocument();
  });

  it("공개 화면에서는 전자상거래법 신원정보를 보여준다", () => {
    renderFooter({ showBusinessInfo: true });
    const info = screen.getByRole("region", { name: "사업자정보" });
    for (const text of [
      "투도도(TODODO)",
      "강수영",
      "266-61-00839",
      "경상남도 김해시",
      "010-2054-1294",
      "dodonriver@gmail.com",
      "통신판매업신고",
    ]) {
      expect(info).toHaveTextContent(text);
    }
  });
});

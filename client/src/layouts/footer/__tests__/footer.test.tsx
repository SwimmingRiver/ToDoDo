import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "../footer";

describe("Footer", () => {
  it("이용약관·개인정보처리방침·환불 정책 링크가 있다", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "약관 및 정책" });
    expect(within(nav).getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(within(nav).getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(within(nav).getByRole("link", { name: "환불 정책" })).toHaveAttribute("href", "/refund");
  });
});

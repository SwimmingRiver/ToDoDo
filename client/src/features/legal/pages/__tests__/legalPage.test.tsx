import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const config = vi.hoisted(() => ({
  sellerName: "",
  contactEmail: "",
  effectiveDate: "",
  privacyOfficer: "",
}));
vi.mock("../../config", () => ({ LEGAL_CONFIG: config }));

import LegalPage from "../legalPage";

const renderPage = (slug: "terms" | "privacy" | "refund") =>
  render(
    <MemoryRouter>
      <LegalPage slug={slug} />
    </MemoryRouter>,
  );

describe("LegalPage", () => {
  beforeEach(() => {
    Object.assign(config, { sellerName: "", contactEmail: "", effectiveDate: "", privacyOfficer: "" });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  it.each([
    ["terms", "이용약관"],
    ["privacy", "개인정보처리방침"],
    ["refund", "환불 정책"],
  ] as const)("%s 문서의 제목을 h1로 보여준다", (slug, title) => {
    renderPage(slug);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("판매자 표기가 비어 있으면 미정 표시가 보인다", () => {
    renderPage("terms");
    expect(screen.getAllByText(/\[판매자명 미정\]/).length).toBeGreaterThan(0);
    expect(screen.getByText(/시행일: \[시행일 미정\]/)).toBeInTheDocument();
  });

  it("판매자 표기를 채우면 그 이름이 본문에 들어간다", () => {
    config.sellerName = "홍길동";
    renderPage("terms");
    expect(screen.getAllByText(/홍길동/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[판매자명 미정\]/)).not.toBeInTheDocument();
  });

  it("표는 좁은 화면에서 가로로 스크롤되는 영역 안에 있다", () => {
    renderPage("privacy");
    const tables = screen.getAllByRole("table");
    for (const table of tables) {
      expect(table.parentElement).toHaveAttribute("role", "region");
      expect(table.parentElement).toHaveAttribute("tabindex", "0");
    }
  });

  it("로고는 홈(/)으로 가는 링크다", () => {
    renderPage("refund");
    expect(screen.getByRole("link", { name: "ToDoDo 홈" })).toHaveAttribute("href", "/");
  });
});

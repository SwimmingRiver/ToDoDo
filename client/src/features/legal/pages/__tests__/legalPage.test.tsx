import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const revisions = vi.hoisted(() => [
  { effectiveOn: "", change: "", config: { sellerName: "", contactEmail: "", privacyOfficer: "" } },
]);
vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  LEGAL_REVISIONS: revisions,
}));

import LegalPage from "../legalPage";

const renderPage = (slug: "terms" | "privacy" | "refund") =>
  render(
    <MemoryRouter>
      <LegalPage slug={slug} />
    </MemoryRouter>,
  );

describe("LegalPage", () => {
  beforeEach(() => {
    revisions.splice(0, revisions.length, {
      effectiveOn: "",
      change: "",
      config: { sellerName: "", contactEmail: "", privacyOfficer: "" },
    });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
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
    revisions[0].config.sellerName = "홍길동";
    renderPage("terms");
    expect(screen.getAllByText(/홍길동/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[판매자명 미정\]/)).not.toBeInTheDocument();
  });

  describe("판 전환", () => {
    beforeEach(() => {
      revisions.splice(
        0,
        revisions.length,
        { effectiveOn: "2030-03-01", change: "제정", config: { sellerName: "첫판", contactEmail: "", privacyOfficer: "" } },
        { effectiveOn: "2030-03-10", change: "판매자 변경", config: { sellerName: "둘째판", contactEmail: "", privacyOfficer: "" } },
      );
    });

    it("다음 판 시행 전에는 이전 판 본문과 변경 예정 공지를 보여준다", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2030-03-05T00:00:00Z"));
      renderPage("terms");
      expect(screen.getAllByText(/첫판/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/둘째판/)).not.toBeInTheDocument();
      expect(screen.getByText(/시행일: 2030년 3월 1일/)).toBeInTheDocument();
      const notice = screen.getByRole("note", { name: "변경 예정 안내" });
      expect(notice).toHaveTextContent("2030년 3월 10일");
      expect(notice).toHaveTextContent("판매자 변경");
    });

    it("시행일이 되면 새 판 본문과 변경 이력을 보여주고 공지는 없다", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2030-03-10T03:00:00Z"));
      renderPage("privacy");
      expect(screen.getAllByText(/둘째판/).length).toBeGreaterThan(0);
      expect(screen.queryByRole("note", { name: "변경 예정 안내" })).not.toBeInTheDocument();
      const history = screen.getByRole("region", { name: "변경 이력" });
      expect(history).toHaveTextContent("2030년 3월 1일");
      expect(history).toHaveTextContent("2030년 3월 10일");
      expect(history).toHaveTextContent("판매자 변경");
    });
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

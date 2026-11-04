import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import LegalPage from "../legalPage";

const renderAt = (initialEntries: string[], initialIndex?: number) =>
  render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/terms" element={<LegalPage slug="terms" />} />
        <Route path="/refund" element={<LegalPage slug="refund" />} />
      </Routes>
    </MemoryRouter>,
  );

describe("LegalPage 이동", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  it("약관 본문의 환불 정책 링크로 이동하면 맨 위로 스크롤한다", async () => {
    const user = setupUser();
    renderAt(["/terms"]);
    vi.mocked(window.scrollTo).mockClear();

    const article = screen.getByRole("article");
    await user.click(within(article).getByRole("link", { name: "환불 정책 보기" }));

    expect(screen.getByRole("heading", { level: 1, name: "환불 정책" })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("뒤로가기·앞으로가기(POP)로 들어오면 스크롤을 건드리지 않는다 — 브라우저가 이전 위치를 복원한다", () => {
    renderAt(["/terms", "/refund"], 1);
    expect(screen.getByRole("heading", { level: 1, name: "환불 정책" })).toBeInTheDocument();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

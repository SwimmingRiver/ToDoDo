import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../landingPage";

const renderLanding = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

describe("LandingPage", () => {
  it("헤더의 요금제 링크가 #pricing으로 간다", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "요금제" })).toHaveAttribute("href", "#pricing");
  });

  it("요금제 섹션과 마감 알림 기능 카드가 있다", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: "요금제" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "마감 알림" })).toBeInTheDocument();
  });

  it("부제가 최신 기능을 소개한다", () => {
    renderLanding();
    expect(screen.getByText("Today·칸반·캘린더에 마감 알림까지, 할 일을 한눈에")).toBeInTheDocument();
  });

  it("푸터에 법적 링크가 있다", () => {
    renderLanding();
    expect(screen.getByRole("navigation", { name: "약관 및 정책" })).toBeInTheDocument();
  });
});

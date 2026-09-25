import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreakCard from "../streakCard";

describe("StreakCard", () => {
  it("streak이 0보다 크면 연속 완료 중 문구를 보여준다", () => {
    render(<StreakCard streak={5} />);

    expect(screen.getByText("5일")).toBeInTheDocument();
    expect(screen.getByText("연속 완료 중")).toBeInTheDocument();
  });

  it("streak이 0이면 시작 안내 문구를 보여준다", () => {
    render(<StreakCard streak={0} />);

    expect(screen.getByText("0일")).toBeInTheDocument();
    expect(screen.getByText("오늘부터 시작해보세요")).toBeInTheDocument();
  });

  it("전체 기간 기준임을 캡션으로 알린다", () => {
    render(<StreakCard streak={3} />);
    expect(screen.getByText("전체 기간 기준")).toBeInTheDocument();
  });
});

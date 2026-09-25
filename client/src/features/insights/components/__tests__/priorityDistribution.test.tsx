import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PriorityDistribution from "../priorityDistribution";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 320 }),
}));

describe("PriorityDistribution", () => {
  it("제목과 우선순위별 개수·비율을 렌더링한다", () => {
    render(<PriorityDistribution distribution={{ low: 2, medium: 5, high: 3 }} title="이번 달 완료한 할 일의 우선순위 분포" />);

    expect(screen.getByText("이번 달 완료한 할 일의 우선순위 분포")).toBeInTheDocument();
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getByText("3 (30%)")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
    expect(screen.getByText("5 (50%)")).toBeInTheDocument();
    expect(screen.getByText("낮음")).toBeInTheDocument();
    expect(screen.getByText("2 (20%)")).toBeInTheDocument();
  });

  it("모두 0이어도 0으로 나누기 없이 렌더링된다", () => {
    render(<PriorityDistribution distribution={{ low: 0, medium: 0, high: 0 }} title="분포" />);

    expect(screen.getAllByText("0 (0%)")).toHaveLength(3);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PriorityDistribution from "../priorityDistribution";

describe("PriorityDistribution", () => {
  it("우선순위별 개수를 렌더링한다", () => {
    render(<PriorityDistribution distribution={{ low: 2, medium: 5, high: 3 }} />);

    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("낮음")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("모두 0이어도 0으로 나누기 없이 렌더링된다", () => {
    render(<PriorityDistribution distribution={{ low: 0, medium: 0, high: 0 }} />);

    expect(screen.getAllByText("0")).toHaveLength(3);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HorizontalBars from "../horizontalBars";

const rows = [
  { label: "높음", value: 3 },
  { label: "보통", value: 6 },
  { label: "낮음", value: 1 },
];

describe("HorizontalBars", () => {
  it("행마다 라벨과 '값 (비율%)'을 그린다", () => {
    render(<HorizontalBars rows={rows} width={320} ariaLabel="우선순위 분포" />);

    expect(screen.getByRole("img", { name: "우선순위 분포" })).toBeInTheDocument();
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getByText("3 (30%)")).toBeInTheDocument();
    expect(screen.getByText("6 (60%)")).toBeInTheDocument();
    expect(screen.getByText("1 (10%)")).toBeInTheDocument();
  });

  it("전부 0이어도 0 (0%)로 그린다", () => {
    render(<HorizontalBars rows={rows.map((r) => ({ ...r, value: 0 }))} width={320} ariaLabel="분포" />);
    expect(screen.getAllByText("0 (0%)")).toHaveLength(3);
  });

  it("width가 0이면 아무것도 그리지 않는다", () => {
    const { container } = render(<HorizontalBars rows={rows} width={0} ariaLabel="분포" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

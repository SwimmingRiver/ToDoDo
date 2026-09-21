import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BarChart from "../barChart";

const points = [
  { label: "9/1", value: 1 },
  { label: "9/2", value: 0 },
  { label: "9/3", value: 5 },
];

describe("BarChart", () => {
  it("role=img + aria-label로 노출되고 포인트 수만큼 막대(rect)를 그린다", () => {
    const { container } = render(<BarChart points={points} width={320} ariaLabel="이번 달 완료 추이" />);

    expect(screen.getByRole("img", { name: "이번 달 완료 추이" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("막대마다 title로 값을 노출한다", () => {
    render(<BarChart points={points} width={320} ariaLabel="추이" formatTitle={(label, value) => `${label}: ${value}건 완료`} />);

    expect(screen.getByTitle("9/3: 5건 완료")).toBeInTheDocument();
  });

  it("y 눈금 숫자와 x 라벨 텍스트를 그린다", () => {
    render(<BarChart points={points} width={320} ariaLabel="추이" />);

    expect(screen.getByText("6")).toBeInTheDocument(); // 최대값 5 → yMax 6
    expect(screen.getByText("9/1")).toBeInTheDocument();
    expect(screen.getByText("9/3")).toBeInTheDocument();
  });

  it("width가 0이면 아무것도 그리지 않는다", () => {
    const { container } = render(<BarChart points={points} width={0} ariaLabel="추이" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

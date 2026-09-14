import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CompletionTrend from "../completionTrend";

describe("CompletionTrend", () => {
  it("추이 일수만큼 컬럼을 렌더링하고 3일 간격 + 마지막 날 라벨을 보여준다", () => {
    const trend = [
      { date: "2026-09-01", count: 1 },
      { date: "2026-09-02", count: 0 },
      { date: "2026-09-03", count: 2 },
      { date: "2026-09-04", count: 0 },
      { date: "2026-09-05", count: 3 },
    ];

    render(<CompletionTrend trend={trend} />);

    expect(screen.getByText("최근 5일 완료 추이")).toBeInTheDocument();
    // index 0(9/1)과 3(9/4)의 배수 라벨 + 마지막 날(9/5)
    expect(screen.getByText("9/1")).toBeInTheDocument();
    expect(screen.getByText("9/4")).toBeInTheDocument();
    expect(screen.getByText("9/5")).toBeInTheDocument();
    // 3일 간격에 해당하지 않는 9/2, 9/3은 라벨을 렌더링하지 않는다
    expect(screen.queryByText("9/2")).not.toBeInTheDocument();
    expect(screen.queryByText("9/3")).not.toBeInTheDocument();
  });

  it("빈 배열이어도 0으로 나누기 없이 렌더링된다", () => {
    render(<CompletionTrend trend={[]} />);

    expect(screen.getByText("최근 0일 완료 추이")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CompletionTrend from "../completionTrend";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 320 }),
}));

describe("CompletionTrend", () => {
  it("제목과 버킷 막대를 그린다", () => {
    const buckets = [
      { key: "2026-09-01", label: "9/1", count: 1 },
      { key: "2026-09-02", label: "9/2", count: 0 },
      { key: "2026-09-03", label: "9/3", count: 2 },
    ];

    const { container } = render(<CompletionTrend buckets={buckets} title="이번 달 완료 추이" />);

    expect(screen.getByText("이번 달 완료 추이")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /이번 달 완료 추이/ })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    // BarChart는 <rect><title>을 렌더링한다(Task 5, rect>title 표준 구조) — title이
    // svg의 직계 자식이 아니라서 testing-library의 getByTitle(svg > title만 인식)은
    // 매치하지 못한다. barChart.test.tsx와 동일하게 querySelectorAll로 확인한다.
    const titles = Array.from(container.querySelectorAll("title")).map((t) => t.textContent);
    expect(titles).toContain("9/3: 2건 완료");
  });

  it("버킷이 비면 빈 상태를 보여준다", () => {
    render(<CompletionTrend buckets={[]} title="전체 기간 완료 추이" />);

    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("버킷이 전부 0이어도 빈 상태를 보여준다", () => {
    render(<CompletionTrend buckets={[{ key: "2026-09-01", label: "9/1", count: 0 }]} title="이번 주 완료 추이" />);

    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeInTheDocument();
  });
});

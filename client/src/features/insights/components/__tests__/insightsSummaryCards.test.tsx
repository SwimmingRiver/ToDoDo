import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InsightsSummaryCards from "../insightsSummaryCards";

describe("InsightsSummaryCards", () => {
  it("각 지표를 퍼센트와 completed/total 형태로 렌더링한다", () => {
    render(
      <InsightsSummaryCards
        completionRate7d={{ completed: 3, total: 4, rate: 0.75 }}
        completionRate30d={{ completed: 10, total: 20, rate: 0.5 }}
        dueAdherence={{ completed: 8, total: 10, rate: 0.8 }}
        recurringVsOneOff={{
          recurring: { completed: 5, total: 5, rate: 1 },
          oneOff: { completed: 3, total: 5, rate: 0.6 },
        }}
      />,
    );

    expect(screen.getByText("최근 7일 완료율")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3 / 4")).toBeInTheDocument();

    expect(screen.getByText("최근 30일 완료율")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();

    expect(screen.getByText("기한 준수율")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();

    expect(screen.getByText("반복 할 일 완료율")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    expect(screen.getByText("일반 할 일 완료율")).toBeInTheDocument();
  });
});

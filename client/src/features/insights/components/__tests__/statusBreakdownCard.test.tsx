import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBreakdownCard from "../statusBreakdownCard";

vi.mock("@/shared/hooks/useElementWidth", () => ({
  default: () => ({ ref: { current: null }, width: 300 }),
}));

describe("StatusBreakdownCard", () => {
  it("누적 막대와 상태별 범례(건수)를 그린다", () => {
    const { container } = render(<StatusBreakdownCard breakdown={{ todo: 1, doing: 2, done: 3 }} />);

    expect(screen.getByText("프로젝트 상태 구성")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /상태 구성/ })).toBeInTheDocument();
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("할 일 1")).toBeInTheDocument();
    expect(screen.getByText("진행 중 2")).toBeInTheDocument();
    expect(screen.getByText("완료 3")).toBeInTheDocument();
  });

  it("전부 0이면 막대 대신 안내 문구", () => {
    render(<StatusBreakdownCard breakdown={{ todo: 0, doing: 0, done: 0 }} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("하위 할 일이 없습니다")).toBeInTheDocument();
  });
});

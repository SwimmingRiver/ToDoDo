import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InsightsFilterBar from "../insightsFilterBar";

const projects = [
  { id: "p1", title: "이사 준비", isDone: false },
  { id: "p2", title: "여름 휴가", isDone: true },
];

describe("InsightsFilterBar", () => {
  it("기간 탭 4개를 그리고 현재 값을 aria-selected로 표시한다", () => {
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["이번 주", "이번 달", "최근 90일", "전체"]);
    expect(screen.getByRole("tab", { name: "이번 달" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "이번 주" })).toHaveAttribute("aria-selected", "false");
  });

  it("탭을 누르면 period만 바뀐 필터로 onChange한다", () => {
    const onChange = vi.fn();
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: "p1" }} projects={projects} onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "최근 90일" }));

    expect(onChange).toHaveBeenCalledWith({ period: "last90Days", projectId: "p1" });
  });

  it("프로젝트 select는 '전체 프로젝트' + 루트 목록이고 완료된 건 (완료) 표시", () => {
    render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "프로젝트" });
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["전체 프로젝트", "이사 준비", "여름 휴가 (완료)"]);
  });

  it("프로젝트를 고르면 projectId가, 전체를 고르면 null이 넘어간다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<InsightsFilterBar filter={{ period: "thisMonth", projectId: null }} projects={projects} onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "p2" } });
    expect(onChange).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: "p2" });

    rerender(<InsightsFilterBar filter={{ period: "thisMonth", projectId: "p2" }} projects={projects} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트" }), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ period: "thisMonth", projectId: null });
  });
});

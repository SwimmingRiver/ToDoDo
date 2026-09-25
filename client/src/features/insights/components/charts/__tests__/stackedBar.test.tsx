import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StackedBar from "../stackedBar";

const segments = [
  { key: "todo", label: "할 일", value: 1 },
  { key: "doing", label: "진행 중", value: 0 },
  { key: "done", label: "완료", value: 3 },
];
const colorOf = (key: string) => (key === "done" ? "var(--status-done-main)" : "var(--status-todo-main)");

describe("StackedBar", () => {
  it("0이 아닌 세그먼트만 title을 가진 rect로 그리고 건수·비율을 넣는다", () => {
    const { container } = render(<StackedBar segments={segments} colorOf={colorOf} width={200} ariaLabel="상태 구성" />);

    expect(screen.getByRole("img", { name: "상태 구성" })).toBeInTheDocument();
    const titles = Array.from(container.querySelectorAll("title")).map((t) => t.textContent);
    expect(titles).toHaveLength(2);
    expect(titles).toContain("완료 3건 (75%)");
  });

  it("합계가 0이거나 width가 0이면 아무것도 그리지 않는다", () => {
    const zero = segments.map((s) => ({ ...s, value: 0 }));
    expect(render(<StackedBar segments={zero} colorOf={colorOf} width={200} ariaLabel="x" />).container.querySelector("svg")).toBeNull();
    expect(render(<StackedBar segments={segments} colorOf={colorOf} width={0} ariaLabel="x" />).container.querySelector("svg")).toBeNull();
  });
});

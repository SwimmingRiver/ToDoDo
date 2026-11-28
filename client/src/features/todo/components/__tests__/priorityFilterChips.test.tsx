import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PriorityFilterChips } from "../priorityFilterChips";

describe("PriorityFilterChips", () => {
  it("높음/보통/낮음 순서로 렌더링한다", () => {
    render(<PriorityFilterChips selected={[]} onToggle={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "높음",
      "보통",
      "낮음",
    ]);
  });

  it("클릭하면 onToggle이 해당 우선순위로 불린다", () => {
    const onToggle = vi.fn();
    render(<PriorityFilterChips selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "높음" }));
    expect(onToggle).toHaveBeenCalledWith("high");
  });

  it("선택된 칩은 aria-pressed=true", () => {
    render(<PriorityFilterChips selected={["medium"]} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "보통" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "높음" })).toHaveAttribute("aria-pressed", "false");
  });
});

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BarChart, HorizontalBars, StackedBar } from "..";

/**
 * fill/stroke에 var(--…)를 프레젠테이션 속성으로 주면 일부 브라우저가 무시해 검게 그린다.
 * 색은 반드시 style로 전달돼야 한다.
 */
const assertNoVarAttributes = (container: HTMLElement) => {
  for (const el of container.querySelectorAll("svg *")) {
    for (const attr of ["fill", "stroke"]) {
      expect(el.getAttribute(attr) ?? "").not.toMatch(/var\(/);
    }
  }
};

describe("차트 색 전달", () => {
  it("BarChart", () => {
    const { container } = render(
      <BarChart points={[{ label: "월", value: 3 }, { label: "화", value: 1 }]} width={300} ariaLabel="t" />,
    );
    assertNoVarAttributes(container);
  });
  it("HorizontalBars", () => {
    const { container } = render(
      <HorizontalBars rows={[{ label: "높음", value: 2 }]} width={300} ariaLabel="t" />,
    );
    assertNoVarAttributes(container);
  });
  it("StackedBar", () => {
    const { container } = render(
      <StackedBar
        segments={[{ key: "done", label: "완료", value: 1 }]}
        colorOf={() => "var(--status-done-main)"}
        width={300}
        ariaLabel="t"
      />,
    );
    assertNoVarAttributes(container);
    expect(container.querySelector("rect[style]")?.getAttribute("style")).toContain("var(--status-done-main)");
  });
});

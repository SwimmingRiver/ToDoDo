import { describe, it, expect } from "vitest";
import { layoutBarChart, niceStep } from "../chart/layoutBarChart";
import { layoutHorizontalBars } from "../chart/layoutHorizontalBars";
import { layoutStackedBar } from "../chart/layoutStackedBar";

describe("niceStep", () => {
  it("1·2·5×10^n 중 rawStep 이상인 가장 작은 값, 최소 1", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(4.3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(34)).toBe(50);
  });
});

describe("layoutBarChart", () => {
  const points = [
    { label: "9/1", value: 1 },
    { label: "9/2", value: 0 },
    { label: "9/3", value: 5 },
    { label: "9/4", value: 3 },
  ];

  it("width나 height가 0 이하이거나 points가 비면 빈 레이아웃", () => {
    const empty = { bars: [], yTicks: [], xLabels: [], baselineY: 0, plotLeft: 0, plotRight: 0 };
    expect(layoutBarChart({ points, width: 0, height: 160 })).toEqual(empty);
    expect(layoutBarChart({ points, width: 320, height: 0 })).toEqual(empty);
    expect(layoutBarChart({ points: [], width: 320, height: 160 })).toEqual(empty);
  });

  it("최대값 5 → 눈금 0,2,4,6이고 가장 높은 막대는 6 기준 비율로 그려진다", () => {
    const layout = layoutBarChart({ points, width: 320, height: 160, padding: { top: 0, right: 0, bottom: 0, left: 0 } });

    expect(layout.yTicks.map((t) => t.value)).toEqual([0, 2, 4, 6]);
    expect(layout.baselineY).toBe(160);
    expect(layout.yTicks[0].y).toBe(160);
    expect(layout.yTicks[3].y).toBe(0);

    const tallest = layout.bars[2];
    expect(tallest.value).toBe(5);
    expect(tallest.h).toBeCloseTo((5 / 6) * 160);
    expect(tallest.y).toBeCloseTo(160 - (5 / 6) * 160);
    expect(layout.bars[1].h).toBe(0);
  });

  it("막대는 plot 폭을 n등분한 슬롯 안에 가운데 정렬되고 서로 겹치지 않는다", () => {
    const layout = layoutBarChart({ points, width: 400, height: 100, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    const slot = 100;
    layout.bars.forEach((bar, i) => {
      expect(bar.w).toBeLessThan(slot);
      expect(bar.x).toBeGreaterThanOrEqual(i * slot);
      expect(bar.x + bar.w).toBeLessThanOrEqual((i + 1) * slot);
    });
  });

  it("전부 0이어도 눈금 0,1이 생기고 막대 높이는 0", () => {
    const layout = layoutBarChart({ points: [{ label: "a", value: 0 }, { label: "b", value: 0 }], width: 100, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(layout.yTicks.map((t) => t.value)).toEqual([0, 1]);
    expect(layout.bars.every((b) => b.h === 0)).toBe(true);
  });

  it("x 라벨은 폭이 좁으면 k개마다 보이고 마지막은 항상 보이며, 마지막과 k 미만으로 가까운 라벨은 숨긴다", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `d${i}`, value: 1 }));
    // plotWidth 96, LABEL_WIDTH 32 → k = ceil(8*32/96) = 3
    const layout = layoutBarChart({ points: many, width: 96, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    const visible = layout.xLabels.filter((l) => l.visible).map((l) => l.text);
    expect(visible).toEqual(["d0", "d3", "d7"]);
  });

  it("폭이 충분하면 모든 라벨이 보인다", () => {
    const layout = layoutBarChart({ points, width: 400, height: 50, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(layout.xLabels.every((l) => l.visible)).toBe(true);
  });
});

describe("layoutHorizontalBars", () => {
  const rows = [
    { label: "높음", value: 3 },
    { label: "보통", value: 6 },
    { label: "낮음", value: 1 },
  ];

  it("width가 0 이하면 빈 배열", () => {
    expect(layoutHorizontalBars({ rows, width: 0 })).toEqual([]);
  });

  it("fillWidth는 최대값 대비, ratio는 합계 대비", () => {
    const layout = layoutHorizontalBars({ rows, width: 200 });
    expect(layout[1]).toEqual({ label: "보통", value: 6, fillWidth: 200, ratio: 0.6 });
    expect(layout[0].fillWidth).toBe(100);
    expect(layout[0].ratio).toBeCloseTo(0.3);
  });

  it("전부 0이면 fillWidth/ratio 모두 0 (0으로 나누기 없음)", () => {
    const layout = layoutHorizontalBars({ rows: rows.map((r) => ({ ...r, value: 0 })), width: 200 });
    expect(layout.every((r) => r.fillWidth === 0 && r.ratio === 0)).toBe(true);
  });
});

describe("layoutStackedBar", () => {
  const segments = [
    { key: "todo", label: "할 일", value: 1 },
    { key: "doing", label: "진행 중", value: 0 },
    { key: "done", label: "완료", value: 3 },
  ];

  it("width가 0 이하거나 합계가 0이면 세그먼트 없음", () => {
    expect(layoutStackedBar({ segments, width: 0 })).toEqual({ total: 4, segments: [] });
    expect(layoutStackedBar({ segments: segments.map((s) => ({ ...s, value: 0 })), width: 100 })).toEqual({ total: 0, segments: [] });
  });

  it("0인 세그먼트를 빼고 왼쪽부터 이어 붙인다", () => {
    const layout = layoutStackedBar({ segments, width: 100 });
    expect(layout.total).toBe(4);
    expect(layout.segments.map((s) => s.key)).toEqual(["todo", "done"]);
    expect(layout.segments[0]).toEqual({ key: "todo", label: "할 일", value: 1, x: 0, w: 25, ratio: 0.25 });
    expect(layout.segments[1]).toEqual({ key: "done", label: "완료", value: 3, x: 25, w: 75, ratio: 0.75 });
  });
});

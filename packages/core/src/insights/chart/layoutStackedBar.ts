export interface StackedBarSegment {
  key: string;
  label: string;
  value: number;
}

export interface StackedBarLayoutSegment extends StackedBarSegment {
  x: number;
  w: number;
  ratio: number;
}

export interface StackedBarLayout {
  total: number;
  /** 값이 0인 세그먼트는 제외. 왼쪽부터 입력 순서대로 이어 붙는다. */
  segments: StackedBarLayoutSegment[];
}

export interface StackedBarLayoutInput {
  segments: StackedBarSegment[];
  width: number;
}

export const layoutStackedBar = ({ segments, width }: StackedBarLayoutInput): StackedBarLayout => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (width <= 0 || total === 0) return { total, segments: [] };

  let x = 0;
  const laidOut = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const w = (s.value / total) * width;
      const segment = { ...s, x, w, ratio: s.value / total };
      x += w;
      return segment;
    });
  return { total, segments: laidOut };
};

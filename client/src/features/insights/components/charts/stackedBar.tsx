import { layoutStackedBar, type StackedBarSegment } from "@tododo/core";

interface StackedBarProps {
  segments: StackedBarSegment[];
  colorOf: (key: string) => string;
  /** 컨테이너 측정 너비. 0이면 그리지 않는다. */
  width: number;
  ariaLabel: string;
}

const HEIGHT = 24;
const RADIUS = 6;

/**
 * 바깥 모서리만 둥글게 잘라내는 클립 경로. <clipPath> 안에 <rect>를 쓰면 그
 * 장식용 rect까지 `querySelectorAll("rect")`에 잡혀 실제 세그먼트 개수와
 * 어긋나므로 <path>로 같은 모양을 그린다 — 시각 결과는 rx와 동일하다.
 */
const roundedRectPath = (w: number, h: number, r: number) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0) return `M0,0 H${w} V${h} H0 Z`;
  return `M${radius},0 H${w - radius} A${radius},${radius} 0 0 1 ${w},${radius} V${h - radius} A${radius},${radius} 0 0 1 ${w - radius},${h} H${radius} A${radius},${radius} 0 0 1 0,${h - radius} V${radius} A${radius},${radius} 0 0 1 ${radius},0 Z`;
};

/** 한 줄짜리 누적 막대. 색만으로 구분하지 않도록 호출부가 범례 텍스트를 함께 둔다. */
const StackedBar = ({ segments, colorOf, width, ariaLabel }: StackedBarProps) => {
  const layout = layoutStackedBar({ segments, width });
  if (layout.segments.length === 0) return null;

  const clipId = `stacked-bar-clip-${ariaLabel.replace(/\s+/g, "-")}`;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}>
      <defs>
        <clipPath id={clipId}>
          <path d={roundedRectPath(width, HEIGHT, RADIUS)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {layout.segments.map((segment) => (
          // <title>은 svg의 직속 자식일 때만 인식되므로(rect 자식이면 안 잡힘)
          // 세그먼트마다 중첩 <svg>로 감싼다 — barChart와 같은 패턴.
          <svg key={segment.key} x={segment.x} y={0} width={segment.w} height={HEIGHT}>
            <title>{`${segment.label} ${segment.value}건 (${Math.round(segment.ratio * 100)}%)`}</title>
            <rect width={segment.w} height={HEIGHT} fill={colorOf(segment.key)} />
          </svg>
        ))}
      </g>
    </svg>
  );
};

export default StackedBar;
export type { StackedBarProps };

import { useId } from "react";
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

/** 한 줄짜리 누적 막대. 색만으로 구분하지 않도록 호출부가 범례 텍스트를 함께 둔다. */
const StackedBar = ({ segments, colorOf, width, ariaLabel }: StackedBarProps) => {
  // 훅 순서를 안정적으로 유지하기 위해 이른 반환보다 먼저 호출한다. ariaLabel을
  // clipPath id로 쓰면 같은 라벨을 쓰는 두 인스턴스가 id를 충돌시킬 수 있어
  // useId로 인스턴스마다 고유한 id를 만든다.
  const clipId = `stacked-bar-clip-${useId()}`;
  const layout = layoutStackedBar({ segments, width });
  if (layout.segments.length === 0) return null;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={HEIGHT} rx={RADIUS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {layout.segments.map((segment) => (
          <rect key={segment.key} x={segment.x} y={0} width={segment.w} height={HEIGHT} style={{ fill: colorOf(segment.key) }}>
            <title>{`${segment.label} ${segment.value}건 (${Math.round(segment.ratio * 100)}%)`}</title>
          </rect>
        ))}
      </g>
    </svg>
  );
};

export default StackedBar;
export type { StackedBarProps };

import { useId } from "react";
import { View } from "react-native";
import Svg, { ClipPath, Defs, G, Rect } from "react-native-svg";
import { layoutStackedBar, type StackedBarSegment } from "@tododo/core";

interface StackedBarProps {
  segments: StackedBarSegment[];
  colorOf: (key: string) => string;
  /** 컨테이너 측정 너비. 0이면 그리지 않는다. */
  width: number;
  accessibilityLabel: string;
}

const HEIGHT = 24;
const RADIUS = 6;

/** 한 줄짜리 누적 막대. 색만으로 구분하지 않도록 호출부가 범례 텍스트를 함께 둔다. */
export const StackedBar = ({ segments, colorOf, width, accessibilityLabel }: StackedBarProps) => {
  // 훅은 이른 반환보다 먼저 호출한다. 인스턴스마다 고유한 clipPath id가 필요하다.
  const clipId = `stacked-bar-clip-${useId()}`;
  const layout = layoutStackedBar({ segments, width });
  if (width === 0 || layout.segments.length === 0) return null;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={0} y={0} width={width} height={HEIGHT} rx={RADIUS} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clipId})`}>
          {layout.segments.map((segment) => (
            <Rect key={segment.key} x={segment.x} y={0} width={segment.w} height={HEIGHT} fill={colorOf(segment.key)} />
          ))}
        </G>
      </Svg>
    </View>
  );
};

export type { StackedBarProps };

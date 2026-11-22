import { View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { layoutBarChart, type BarChartPoint } from "@tododo/core";
import { colors } from "../../theme/colors";

interface BarChartProps {
  points: BarChartPoint[];
  /** 컨테이너 측정 너비. 0이면 아무것도 그리지 않는다(측정 전 첫 렌더). */
  width: number;
  height?: number;
  accessibilityLabel: string;
}

const DEFAULT_HEIGHT = 160;

/** 세로 막대 차트. 기하는 core의 layoutBarChart가 계산하고 여기서는 그리기만 한다. */
export const BarChart = ({ points, width, height = DEFAULT_HEIGHT, accessibilityLabel }: BarChartProps) => {
  const layout = layoutBarChart({ points, width, height });
  if (width === 0 || layout.bars.length === 0) return null;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {layout.yTicks.map((tick) => (
          <G key={tick.value}>
            <Line x1={layout.plotLeft} x2={layout.plotRight} y1={tick.y} y2={tick.y} stroke={colors.border.tertiary} strokeWidth={1} />
            <SvgText x={layout.plotLeft - 6} y={tick.y} textAnchor="end" alignmentBaseline="middle" fontSize={10} fill={colors.text.tertiary}>
              {tick.value}
            </SvgText>
          </G>
        ))}
        {layout.bars.map((bar, index) => (
          <Rect key={index} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3} fill={colors.brand.strong} />
        ))}
        {layout.xLabels
          .filter((label) => label.visible)
          .map((label, index) => (
            <SvgText key={index} x={label.x} y={layout.baselineY + 14} textAnchor="middle" fontSize={10} fill={colors.text.tertiary}>
              {label.text}
            </SvgText>
          ))}
      </Svg>
    </View>
  );
};

export type { BarChartProps };

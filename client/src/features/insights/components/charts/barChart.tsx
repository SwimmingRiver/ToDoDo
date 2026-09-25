import { layoutBarChart, type BarChartPoint } from "@tododo/core";
import { colors } from "@/styles/colors";

interface BarChartProps {
  points: BarChartPoint[];
  /** 컨테이너 측정 너비. 0이면 아무것도 그리지 않는다(측정 전 첫 렌더). */
  width: number;
  height?: number;
  ariaLabel: string;
  /** 막대 hover/보조기기용 <title> 문구. */
  formatTitle?: (label: string, value: number) => string;
}

const DEFAULT_HEIGHT = 160;
const defaultFormatTitle = (label: string, value: number) => `${label}: ${value}`;

/**
 * 세로 막대 차트. 기하는 전부 core의 layoutBarChart가 계산하고 여기서는 숫자를
 * <svg>에 옮겨 그리기만 한다 — 같은 레이아웃을 RN에서 react-native-svg로 그리기 위함.
 */
const BarChart = ({ points, width, height = DEFAULT_HEIGHT, ariaLabel, formatTitle = defaultFormatTitle }: BarChartProps) => {
  const layout = layoutBarChart({ points, width, height });
  if (layout.bars.length === 0) return null;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      {layout.yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={layout.plotLeft} x2={layout.plotRight} y1={tick.y} y2={tick.y} style={{ stroke: colors.border.tertiary }} strokeWidth={1} />
          <text x={layout.plotLeft - 6} y={tick.y} textAnchor="end" dominantBaseline="middle" fontSize={10} style={{ fill: colors.text.tertiary }}>
            {tick.value}
          </text>
        </g>
      ))}
      {layout.bars.map((bar, index) => (
        <rect key={index} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3} style={{ fill: colors.brand.strong }}>
          <title>{formatTitle(bar.label, bar.value)}</title>
        </rect>
      ))}
      {layout.xLabels
        .filter((label) => label.visible)
        .map((label, index) => (
          <text key={index} x={label.x} y={layout.baselineY + 14} textAnchor="middle" fontSize={10} style={{ fill: colors.text.tertiary }}>
            {label.text}
          </text>
        ))}
    </svg>
  );
};

export default BarChart;
export type { BarChartProps };

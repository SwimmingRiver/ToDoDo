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
          <line x1={layout.plotLeft} x2={layout.plotRight} y1={tick.y} y2={tick.y} stroke={colors.border.tertiary} strokeWidth={1} />
          <text x={layout.plotLeft - 6} y={tick.y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={colors.text.tertiary}>
            {tick.value}
          </text>
        </g>
      ))}
      {layout.bars.map((bar) => (
        // <title>은 svg의 직속 자식일 때만 testing-library getByTitle/브라우저
        // 네이티브 툴팁이 인식한다(rect 자식으로 두면 안 잡힘) — 막대마다 작은
        // 중첩 <svg>로 감싸 x/y/width/height를 옮기고 그 안에 title+rect를 둔다.
        <svg key={bar.label} x={bar.x} y={bar.y} width={bar.w} height={bar.h}>
          <title>{formatTitle(bar.label, bar.value)}</title>
          <rect width={bar.w} height={bar.h} rx={3} fill={colors.brand.strong} />
        </svg>
      ))}
      {layout.xLabels
        .filter((label) => label.visible)
        .map((label) => (
          <text key={label.text} x={label.x} y={layout.baselineY + 14} textAnchor="middle" fontSize={10} fill={colors.text.tertiary}>
            {label.text}
          </text>
        ))}
    </svg>
  );
};

export default BarChart;
export type { BarChartProps };

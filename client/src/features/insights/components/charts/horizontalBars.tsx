import { layoutHorizontalBars, type HorizontalBarRow } from "@tododo/core";
import { colors } from "@/styles/colors";

interface HorizontalBarsProps {
  rows: HorizontalBarRow[];
  /** 컨테이너 측정 너비(라벨/숫자 칸 포함 전체). 0이면 그리지 않는다. */
  width: number;
  ariaLabel: string;
}

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 40;
// "120 (100%)"까지 13px/500 굵기로 잘리지 않아야 하는 값 칸 너비
const VALUE_WIDTH = 80;
const GAP = 8;
const TRACK_HEIGHT = 8;

/** 가로 막대 목록. 텍스트가 범주를, 막대는 크기만 인코딩한다(단일 색). */
const HorizontalBars = ({ rows, width, ariaLabel }: HorizontalBarsProps) => {
  const trackX = LABEL_WIDTH + GAP;
  const trackWidth = width - trackX - GAP - VALUE_WIDTH;
  const layout = layoutHorizontalBars({ rows, width: trackWidth });
  if (layout.length === 0) return null;

  const height = rows.length * ROW_HEIGHT;
  const trackY = ROW_HEIGHT / 2 - TRACK_HEIGHT / 2;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      {layout.map((row, i) => {
        const y = i * ROW_HEIGHT;
        const valueText = `${row.value} (${Math.round(row.ratio * 100)}%)`;
        return (
          <g key={i}>
            <text x={0} y={y + ROW_HEIGHT / 2} dominantBaseline="middle" fontSize={13} fontWeight={500} fill={colors.text.secondary}>
              {row.label}
            </text>
            <rect x={trackX} y={y + trackY} width={trackWidth} height={TRACK_HEIGHT} rx={4} fill={colors.background.secondary} />
            <rect x={trackX} y={y + trackY} width={row.fillWidth} height={TRACK_HEIGHT} rx={4} fill={colors.brand.strong}>
              <title>{`${row.label} ${valueText}`}</title>
            </rect>
            <text x={width} y={y + ROW_HEIGHT / 2} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight={500} fill={colors.text.primary}>
              {valueText}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default HorizontalBars;
export type { HorizontalBarsProps };

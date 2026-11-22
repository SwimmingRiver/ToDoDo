import { View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { layoutHorizontalBars, type HorizontalBarRow } from "@tododo/core";
import { colors } from "../../theme/colors";

interface HorizontalBarsProps {
  rows: HorizontalBarRow[];
  /** 컨테이너 측정 너비(라벨/숫자 칸 포함 전체). 0이면 그리지 않는다. */
  width: number;
  accessibilityLabel: string;
}

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 40;
// "120 (100%)"까지 잘리지 않아야 하는 값 칸 너비
const VALUE_WIDTH = 80;
const GAP = 8;
const TRACK_HEIGHT = 8;

/** 가로 막대 목록. 텍스트가 범주를, 막대는 크기만 인코딩한다(단일 색). */
const HorizontalBars = ({ rows, width, accessibilityLabel }: HorizontalBarsProps) => {
  const trackX = LABEL_WIDTH + GAP;
  const trackWidth = width - trackX - GAP - VALUE_WIDTH;
  const layout = layoutHorizontalBars({ rows, width: trackWidth });
  if (width === 0 || layout.length === 0) return null;

  const height = rows.length * ROW_HEIGHT;
  const trackY = ROW_HEIGHT / 2 - TRACK_HEIGHT / 2;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {layout.map((row, i) => {
          const y = i * ROW_HEIGHT;
          const valueText = `${row.value} (${Math.round(row.ratio * 100)}%)`;
          return (
            <G key={i}>
              <SvgText x={0} y={y + ROW_HEIGHT / 2} alignmentBaseline="middle" fontSize={13} fontWeight="500" fill={colors.text.secondary}>
                {row.label}
              </SvgText>
              <Rect x={trackX} y={y + trackY} width={trackWidth} height={TRACK_HEIGHT} rx={4} fill={colors.background.secondary} />
              <Rect x={trackX} y={y + trackY} width={row.fillWidth} height={TRACK_HEIGHT} rx={4} fill={colors.brand.strong} />
              <SvgText x={width} y={y + ROW_HEIGHT / 2} textAnchor="end" alignmentBaseline="middle" fontSize={13} fontWeight="500" fill={colors.text.primary}>
                {valueText}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

export default HorizontalBars;
export type { HorizontalBarsProps };

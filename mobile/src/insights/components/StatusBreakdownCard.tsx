import { StyleSheet, Text, View } from "react-native";
import type { StatusBreakdown } from "@tododo/core";
import { StackedBar } from "../charts/StackedBar";
import { useMeasuredWidth } from "../charts/useMeasuredWidth";
import { colors } from "../../theme/colors";
import { statusColors, type Status } from "../../theme/statusColors";
import { spacing } from "../../theme/spacing";
import { cardStyles } from "./cardStyles";

interface StatusBreakdownCardProps {
  breakdown: StatusBreakdown;
}

const STATUS_ORDER: { key: Status; label: string }[] = [
  { key: "todo", label: "할 일" },
  { key: "doing", label: "진행 중" },
  { key: "done", label: "완료" },
];

const colorOf = (key: string) => statusColors[key as Status].main;

/** 선택한 프로젝트의 현재 상태 구성. 색만으로 구분하지 않도록 범례에 건수를 병기한다. */
export const StatusBreakdownCard = ({ breakdown }: StatusBreakdownCardProps) => {
  const { width, onLayout } = useMeasuredWidth();
  const segments = STATUS_ORDER.map(({ key, label }) => ({ key, label, value: breakdown[key] }));
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>프로젝트 상태 구성</Text>
      {total === 0 ? (
        <Text style={styles.hint}>하위 할 일이 없습니다</Text>
      ) : (
        <>
          <View onLayout={onLayout}>
            <StackedBar segments={segments} colorOf={colorOf} width={width} accessibilityLabel={`프로젝트 상태 구성, 총 ${total}건`} />
          </View>
          <View style={styles.legend}>
            {segments.map((segment) => (
              <View key={segment.key} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colorOf(segment.key) }]} />
                <Text style={styles.legendText}>{`${segment.label} ${segment.value}`}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: colors.text.tertiary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.text.secondary },
});

export type { StatusBreakdownCardProps };

import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radius, spacing } from "../../../theme/spacing";

interface PeriodBadgeProps {
  /** 1부터 시작하는 진행 일차 */
  dayIndex: number;
  /** startAt~dueAt 총 일수(양 끝 포함) */
  totalDays: number;
}

/**
 * 기간(startAt~dueAt) 항목이 매일 노출될 때 "오늘이 며칠째인지" 보여주는 칩.
 * 브랜드 그린(RecurrenceBadge)과 겹치지 않도록 중립 회색을 쓴다.
 */
export const PeriodBadge = ({ dayIndex, totalDays }: PeriodBadgeProps) => (
  <View style={styles.badge}>
    <Text style={styles.text}>{`${dayIndex}/${totalDays}일차`}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.background.secondary,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.secondary,
  },
});

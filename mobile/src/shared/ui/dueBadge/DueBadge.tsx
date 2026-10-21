import { StyleSheet, Text, View } from "react-native";
import { getDueBadgeLabel } from "../../utils/due";
import { colors } from "../../../theme/colors";
import { urgencyColors } from "../../../theme/urgencyColors";

interface DueBadgeProps {
  daysLeft: number;
  /** getUrgency 결과 중 배지를 보여주는 두 단계. "danger"는 마감 당일(D-day)도 포함한다. */
  urgency: "danger" | "soon";
  testID?: string;
}

const BADGE_COLORS = {
  danger: { backgroundColor: colors.danger.background, color: colors.danger.text },
  soon: { backgroundColor: urgencyColors.soon.background, color: urgencyColors.soon.text },
} as const;

/**
 * 웹 오늘 화면(todayTodoItem.styles.tsx)의 OverdueBadge/DueSoonBadge와 같은 연한 배경 +
 * 진한 글자 pill.
 */
export const DueBadge = ({ daysLeft, urgency, testID }: DueBadgeProps) => {
  const { backgroundColor, color } = BADGE_COLORS[urgency];

  return (
    <View testID={testID} style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.label, { color }]}>{getDueBadgeLabel(daysLeft)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
});

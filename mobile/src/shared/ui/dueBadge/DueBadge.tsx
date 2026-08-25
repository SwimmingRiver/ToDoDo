import { StyleSheet, Text, View } from "react-native";
import { getDueBadgeLabel } from "../../utils/due";

interface DueBadgeProps {
  daysLeft: number;
}

/**
 * 웹 todoListItem.styles.tsx DueBadge와 동일한 3단계 색상 로직을 그대로 이식한다.
 * (초과: 빨강 / D-day: 주황 / 임박: 호박색) — 토큰이 없는 web-only 리터럴이라
 * 시각 차이 없음을 우선해 그대로 가져온다(design/spec.md "색상" 절 참고).
 */
export const DueBadge = ({ daysLeft }: DueBadgeProps) => {
  const backgroundColor = daysLeft < 0 ? "#ef4444" : daysLeft === 0 ? "#f97316" : "#f59e0b";

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={styles.label}>{getDueBadgeLabel(daysLeft)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
});

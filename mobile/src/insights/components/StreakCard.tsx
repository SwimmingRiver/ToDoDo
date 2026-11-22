import { StyleSheet, Text, View } from "react-native";
import { Flame } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { cardStyles } from "./cardStyles";

interface StreakCardProps {
  streak: number;
}

/** 스트릭은 기간/프로젝트 필터와 무관하게 항상 전체 기준이라 캡션으로 알린다. */
export const StreakCard = ({ streak }: StreakCardProps) => (
  <View style={[cardStyles.card, styles.card]}>
    <View style={styles.iconWrapper}>
      <Flame size={20} color={colors.brand.strong} />
    </View>
    <View style={styles.content}>
      <Text style={styles.value}>{streak}일</Text>
      <Text style={styles.label}>{streak > 0 ? "연속 완료 중" : "오늘부터 시작해보세요"}</Text>
      <Text style={styles.caption}>전체 기간 기준</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { gap: 2 },
  value: { fontSize: 24, fontWeight: "700", color: colors.text.primary },
  label: { fontSize: 13, fontWeight: "500", color: colors.text.secondary },
  caption: { fontSize: 11, color: colors.text.tertiary },
});

export type { StreakCardProps };

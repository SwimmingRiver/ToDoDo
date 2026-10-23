import { StyleSheet, Text, View } from "react-native";
import { Repeat } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { radius } from "../../../theme/spacing";

interface RecurrenceBadgeProps {
  /** true면 아이콘만(스크린리더용 라벨 "반복 할 일"), false(기본)면 "반복" 텍스트 포함 */
  compact?: boolean;
}

/**
 * 반복 할 일임을 나타내는 배지. 웹 shared/ui/recurrenceBadge/recurrenceBadge.tsx를
 * 그대로 포팅한다. compact는 오늘 탭 항목처럼 한 줄 공간이 좁은 곳에서 쓴다.
 */
export const RecurrenceBadge = ({ compact = false }: RecurrenceBadgeProps) => {
  return (
    <View
      style={styles.badge}
      accessible={compact}
      accessibilityLabel={compact ? "반복 할 일" : undefined}
    >
      <Repeat size={12} color={colors.brand.strong} />
      {!compact && <Text style={styles.text}>반복</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.brand.strong,
  },
});

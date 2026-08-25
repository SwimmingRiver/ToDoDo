import { StyleSheet, Text, View } from "react-native";
import { Repeat } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { radius } from "../../../theme/spacing";

/**
 * 반복 할 일임을 나타내는 배지. 웹 shared/ui/recurrenceBadge/recurrenceBadge.tsx를
 * 그대로 포팅 — 항상 아이콘+"반복" 텍스트를 함께 보여준다(웹의 compact prop은 이번
 * TodoListScreen 재설계 범위에서 쓰이지 않아 이식하지 않았다).
 */
export const RecurrenceBadge = () => {
  return (
    <View style={styles.badge}>
      <Repeat size={12} color={colors.brand.strong} />
      <Text style={styles.text}>반복</Text>
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

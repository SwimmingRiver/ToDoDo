import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radius } from "../../../theme/spacing";

interface RecurrenceMissedBadgeProps {
  /** 같은 반복 시리즈에서 조용히 archived 처리된(overdueArchived) 지난 회차 수 */
  count: number;
}

/**
 * 웹 shared/ui/recurrenceMissedBadge/recurrenceMissedBadge.tsx를 그대로 포팅.
 * count가 0 이하면 아무것도 렌더링하지 않는다 — 호출부에서 조건부로 감싸지 않아도
 * 안전하도록 컴포넌트 자체에서 가드한다.
 */
export const RecurrenceMissedBadge = ({ count }: RecurrenceMissedBadgeProps) => {
  if (count <= 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{count}회 밀림</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: colors.danger.background,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.danger.text,
  },
});

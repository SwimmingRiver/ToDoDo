import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../shared/ui/button/Button";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

interface PlanLockedNoticeProps {
  onSubscribe: () => void;
}

export const PlanLockedNotice = ({ onSubscribe }: PlanLockedNoticeProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>AI 할 일 플랜은 프리미엄 기능입니다</Text>
    <Text style={styles.description}>
      목표를 적으면 AI가 실행 단계와 날짜를 나눠 제안해요. 프리미엄 구독이 필요합니다
    </Text>
    <Button title="구독 알아보기" onPress={onSubscribe} />
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignItems: "center", paddingVertical: spacing.xl },
  title: { fontSize: 18, fontWeight: "700", color: colors.text.primary, textAlign: "center" },
  description: { fontSize: 14, color: colors.text.secondary, textAlign: "center", lineHeight: 20 },
});

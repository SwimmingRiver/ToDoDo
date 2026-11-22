import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../shared/ui/button/Button";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

interface InsightsLockedNoticeProps {
  onSubscribe: () => void;
}

export const InsightsLockedNotice = ({ onSubscribe }: InsightsLockedNoticeProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>완료 통계는 프리미엄 기능입니다</Text>
    <Text style={styles.description}>
      완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다
    </Text>
    <Button title="구독 알아보기" onPress={onSubscribe} />
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignItems: "center", paddingVertical: spacing.xl },
  title: { fontSize: 18, fontWeight: "700", color: colors.text.primary, textAlign: "center" },
  description: { fontSize: 14, color: colors.text.secondary, textAlign: "center", lineHeight: 20 },
});

export type { InsightsLockedNoticeProps };

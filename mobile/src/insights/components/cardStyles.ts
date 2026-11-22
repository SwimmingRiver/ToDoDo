import { StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";

/** 인사이트 카드 공통 테두리·배경(웹 *.styles.tsx의 Card와 같은 모양). */
export const cardStyles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    borderRadius: radius.md,
    backgroundColor: colors.background.primary,
  },
  title: { fontSize: 14, fontWeight: "600", color: colors.text.primary, marginBottom: spacing.md },
});

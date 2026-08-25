import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button } from "../button/Button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** 웹 shared/ui/emptyState와 동일한 레이아웃(아이콘+제목+설명+선택적 액션 버튼). */
export const EmptyState = ({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Icon size={36} color={colors.text.tertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} variant="primary" style={styles.action} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: 40,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 280,
    marginBottom: spacing.xl,
  },
  action: {
    width: 200,
  },
});

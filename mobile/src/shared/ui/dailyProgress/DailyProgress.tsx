import { StyleSheet, Text, View } from "react-native";
import { ProgressBar } from "../progressBar/ProgressBar";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface DailyProgressProps {
  dateLabel: string;
  doneCount: number;
  totalCount: number;
}

export const DailyProgress = ({ dateLabel, doneCount, totalCount }: DailyProgressProps) => {
  const progress = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <Text style={styles.completionLabel}>{`${doneCount} / ${totalCount} 완료`}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  completionLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },
});

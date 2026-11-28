import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../theme/spacing";

interface WeekHeaderProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

/** 주간 보기 헤더: ‹ 11월 22일 – 28일 › [오늘]. 화살표·오늘 칩 모양은 오늘 탭 WeekStrip과 같다. */
export const WeekHeader = ({ label, onPrev, onNext, onToday }: WeekHeaderProps) => (
  <View style={styles.header}>
    <Pressable onPress={onPrev} accessibilityRole="button" accessibilityLabel="이전 주" hitSlop={13} style={styles.arrow}>
      <ChevronLeft size={20} color={colors.brand.strong} />
    </Pressable>
    <Text style={styles.label} accessibilityRole="header">
      {label}
    </Text>
    <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="다음 주" hitSlop={13} style={styles.arrow}>
      <ChevronRight size={20} color={colors.brand.strong} />
    </Pressable>
    <Pressable onPress={onToday} accessibilityRole="button" accessibilityLabel="오늘" style={styles.todayChip}>
      <Text style={styles.todayChipText}>오늘</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  arrow: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  todayChip: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand.strong,
  },
});

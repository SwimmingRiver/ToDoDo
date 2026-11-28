import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../theme/spacing";

export type CalendarViewMode = "month" | "week";

const MODES: { mode: CalendarViewMode; label: string }[] = [
  { mode: "month", label: "월간" },
  { mode: "week", label: "주간" },
];

interface ViewModeToggleProps {
  mode: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}

/** 캘린더 [월간|주간] 분할 버튼. 통계 탭 기간 선택(InsightsFilterBar)과 같은 모양·접근성 패턴. */
export const ViewModeToggle = ({ mode, onChange }: ViewModeToggleProps) => (
  <View style={styles.tabList} accessibilityRole="tablist">
    {MODES.map((option) => {
      const selected = option.mode === mode;
      return (
        <Pressable
          key={option.mode}
          testID={`view-mode-${option.mode}`}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          onPress={() => onChange(option.mode)}
          style={[styles.tab, selected && styles.tabSelected]}
        >
          <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  tabList: {
    flexDirection: "row",
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    padding: spacing.xs,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  tabSelected: { backgroundColor: colors.brand.strong },
  tabText: { fontSize: 14, fontWeight: "500", color: colors.text.secondary },
  tabTextSelected: { color: colors.background.primary, fontWeight: "600" },
});

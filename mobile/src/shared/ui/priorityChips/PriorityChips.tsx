import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

export type Priority = "low" | "medium" | "high";

interface PriorityChipsProps {
  value: Priority;
  onChange: (value: Priority) => void;
}

const OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
];

/**
 * 웹의 <select priority>를 대체하는 3-세그먼트 칩(의사결정 확정 1번).
 * 선택된 칩은 brand.tint 배경 + brand.strong 텍스트.
 */
export const PriorityChips = ({ value, onChange }: PriorityChipsProps) => {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`우선순위 ${option.label}`}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && !selected && styles.chipPressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    backgroundColor: colors.background.primary,
  },
  chipSelected: {
    backgroundColor: colors.brand.tint,
    borderColor: colors.brand.strong,
  },
  chipPressed: {
    backgroundColor: colors.background.secondary,
  },
  label: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  labelSelected: {
    color: colors.brand.strong,
    fontWeight: "600",
  },
});

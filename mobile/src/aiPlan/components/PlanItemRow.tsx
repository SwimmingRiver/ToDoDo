import { StyleSheet, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import type { DraftFields, DraftItem } from "@tododo/core/dist/aiPlan/index.js";
import { Checkbox } from "../../shared/ui/checkbox/Checkbox";
import { DateField } from "../../shared/ui/dateField/DateField";
import { IconButton } from "../../shared/ui/iconButton/IconButton";
import { PriorityChips } from "../../shared/ui/priorityChips/PriorityChips";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";

interface PlanItemRowProps {
  item: DraftItem;
  today: string;
  onChange: (patch: Partial<DraftFields>) => void;
  onToggle: () => void;
  onRemove: () => void;
}

export const PlanItemRow = ({ item, today, onChange, onToggle, onRemove }: PlanItemRowProps) => {
  const label = item.title.trim() || "새 항목";
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Checkbox checked={item.checked} onPress={onToggle} accessibilityLabel={`${label} 포함`} />
        <TextInput
          value={item.title}
          onChangeText={(title) => onChange({ title })}
          maxLength={100}
          placeholder="할 일 제목"
          placeholderTextColor={colors.text.tertiary}
          accessibilityLabel={`${label} 제목`}
          style={[styles.input, styles.titleInput]}
        />
        <IconButton icon={X} onPress={onRemove} accessibilityLabel={`${label} 삭제`} />
      </View>
      <DateField
        label={`${label} 마감일`}
        value={item.dueDate}
        onChange={(dueDate) => onChange({ dueDate })}
        minimumDate={today}
      />
      <PriorityChips value={item.priority} onChange={(priority) => onChange({ priority })} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    borderRadius: radius.md,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  titleInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
});

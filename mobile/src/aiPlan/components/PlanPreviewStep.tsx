import type { Dispatch } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  canSubmit,
  checkedCount,
  type PlanDraft,
  type PlanDraftAction,
  type PlanUsage,
} from "@tododo/core/dist/aiPlan/index.js";
import { Button } from "../../shared/ui/button/Button";
import { DateField } from "../../shared/ui/dateField/DateField";
import { PriorityChips } from "../../shared/ui/priorityChips/PriorityChips";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { PlanItemRow } from "./PlanItemRow";

interface PlanPreviewStepProps {
  draft: PlanDraft;
  dispatch: Dispatch<PlanDraftAction>;
  usage: PlanUsage | null;
  today: string;
  isRegenerating: boolean;
  isSaving: boolean;
  onRegenerate: () => void;
  onSubmit: () => void;
}

export const PlanPreviewStep = ({
  draft,
  dispatch,
  usage,
  today,
  isRegenerating,
  isSaving,
  onRegenerate,
  onSubmit,
}: PlanPreviewStepProps) => {
  const count = checkedCount(draft);
  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>AI가 만든 계획</Text>
        {usage && <Text style={styles.usage}>{`오늘 ${usage.used}/${usage.limit}회`}</Text>}
      </View>
      <View style={styles.parent}>
        <Text style={styles.label}>상위</Text>
        <TextInput
          value={draft.parent.title}
          onChangeText={(title) => dispatch({ type: "updateParent", patch: { title } })}
          maxLength={100}
          accessibilityLabel="상위 할 일 제목"
          placeholderTextColor={colors.text.tertiary}
          style={styles.input}
        />
        <DateField
          label="상위 할 일 마감일"
          value={draft.parent.dueDate}
          onChange={(dueDate) => dispatch({ type: "updateParent", patch: { dueDate } })}
          minimumDate={today}
        />
        <PriorityChips
          value={draft.parent.priority}
          onChange={(priority) => dispatch({ type: "updateParent", patch: { priority } })}
        />
      </View>
      {draft.items.map((item) => (
        <PlanItemRow
          key={item.key}
          item={item}
          today={today}
          onChange={(patch) => dispatch({ type: "updateItem", key: item.key, patch })}
          onToggle={() => dispatch({ type: "toggleItem", key: item.key })}
          onRemove={() => dispatch({ type: "removeItem", key: item.key })}
        />
      ))}
      <Button
        title="+ 항목 직접 추가"
        variant="text"
        onPress={() => dispatch({ type: "addItem" })}
        style={styles.addItem}
      />
      <Button
        title={isRegenerating ? "계획을 짜는 중…" : "다시 만들기"}
        variant="outline"
        onPress={onRegenerate}
        disabled={isRegenerating || isSaving}
      />
      <Button
        title={`${count}개 추가`}
        onPress={onSubmit}
        disabled={!canSubmit(draft) || isSaving || isRegenerating}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  headingRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text.primary },
  usage: { fontSize: 12, color: colors.text.secondary },
  parent: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.text.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.sm,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
  addItem: { alignSelf: "flex-start" },
});

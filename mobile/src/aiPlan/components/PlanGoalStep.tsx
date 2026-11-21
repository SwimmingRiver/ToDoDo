import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../shared/ui/button/Button";
import { DateField } from "../../shared/ui/dateField/DateField";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";

interface PlanGoalStepProps {
  goal: string;
  dueDate: string;
  today: string;
  isPending: boolean;
  onGoalChange: (goal: string) => void;
  onDueDateChange: (dueDate: string) => void;
  onSubmit: () => void;
}

export const PlanGoalStep = ({
  goal,
  dueDate,
  today,
  isPending,
  onGoalChange,
  onDueDateChange,
  onSubmit,
}: PlanGoalStepProps) => (
  <View style={styles.container}>
    <Text style={styles.heading}>AI로 계획 만들기</Text>
    <Text style={styles.label}>목표</Text>
    <TextInput
      value={goal}
      onChangeText={onGoalChange}
      maxLength={200}
      placeholder="예: 다음 달 이사 준비"
      placeholderTextColor={colors.text.tertiary}
      editable={!isPending}
      accessibilityLabel="목표"
      style={styles.input}
    />
    <DateField
      label="마감일(선택)"
      value={dueDate || null}
      onChange={(key) => onDueDateChange(key ?? "")}
      minimumDate={today}
    />
    <Text style={styles.notice}>입력한 목표는 계획 생성을 위해 AI(Anthropic)로 전송돼요</Text>
    <Button
      title={isPending ? "계획을 짜는 중…" : "계획 만들기"}
      onPress={onSubmit}
      disabled={isPending || !goal.trim()}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text.primary },
  label: { fontSize: 14, fontWeight: "600", color: colors.text.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
  notice: { fontSize: 12, color: colors.text.secondary },
});

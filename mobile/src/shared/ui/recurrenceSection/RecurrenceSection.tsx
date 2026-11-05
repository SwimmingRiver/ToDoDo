import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  WEEKDAY_LABELS,
  DEFAULT_RECURRENCE_FORM_VALUE,
  WEEKDAY_REQUIRED_ERROR,
  getRecurrenceValidationError,
  type RecurrenceFormValue,
} from "@tododo/core";
import { DateField } from "../dateField/DateField";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

interface RecurrenceSectionProps {
  /** 하위 할 일 존재 또는 startAt 미입력 시 true */
  disabled: boolean;
  disabledReason?: "hasChildren" | "noStartAt";
  /** 반복 시작 앵커. 매월 반복의 '일(day)' 유도에도 사용 */
  startAt: string | null;
  /** null = 반복 OFF */
  value: RecurrenceFormValue | null;
  onChange: (value: RecurrenceFormValue | null) => void;
}

const TYPE_OPTIONS: { value: RecurrenceFormValue["type"]; label: string }[] = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
];

const END_OPTIONS: { value: RecurrenceFormValue["endType"]; label: string }[] = [
  { value: "indefinite", label: "없음" },
  { value: "untilDate", label: "날짜 지정" },
];

/** 웹 recurrenceFields.tsx의 모바일 대응(A안): 스위치를 켜면 주기·요일·범위 안내가 펼쳐진다. */
export const RecurrenceSection = ({
  disabled,
  disabledReason,
  startAt,
  value,
  onChange,
}: RecurrenceSectionProps) => {
  const checked = value !== null;
  const weekdayError = value?.type === "weekly" && (value.weekdays?.length ?? 0) === 0;
  const validationError = getRecurrenceValidationError(value, startAt);
  const rangeError =
    validationError && validationError !== WEEKDAY_REQUIRED_ERROR ? validationError : null;

  // 종료 조건은 폼 값에서 온다. 날짜 지정인데 날짜가 없으면 안내 대신 검증 오류가 보인다.
  const rangeText =
    value?.endType === "untilDate"
      ? value.endDate
        ? `${value.endDate}까지 반복됩니다`
        : null
      : "계속 반복됩니다";

  const handleEndTypeChange = (endType: RecurrenceFormValue["endType"]) => {
    if (!value || value.endType === endType) return;
    onChange({ ...value, endType, endDate: null });
  };

  const handleToggle = (next: boolean) => {
    if (disabled) return;
    onChange(next ? { ...DEFAULT_RECURRENCE_FORM_VALUE } : null);
  };

  const handleTypeChange = (type: RecurrenceFormValue["type"]) => {
    if (!value) return;
    onChange({
      ...value,
      type,
      weekdays: type === "weekly" ? (value.weekdays ?? []) : undefined,
    });
  };

  const handleWeekdayToggle = (day: number) => {
    if (!value) return;
    const current = value.weekdays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays: next });
  };

  const startDay = startAt ? new Date(startAt).getDate() : null;
  const isPanelOpen = checked && !disabled;

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, disabled && styles.textDisabled]}>
          이 할 일을 반복합니다
        </Text>
        <Switch
          value={checked}
          disabled={disabled}
          onValueChange={handleToggle}
          accessibilityLabel="이 할 일을 반복합니다"
          trackColor={{ false: colors.border.secondary, true: colors.brand.strong }}
        />
      </View>

      {disabled && (
        <Text style={styles.disabledHint}>
          {disabledReason === "hasChildren"
            ? "하위 할 일이 있는 항목은 반복을 설정할 수 없습니다"
            : "반복 설정은 시작일시를 입력해야 사용할 수 있습니다"}
        </Text>
      )}

      {isPanelOpen && value && (
        <View style={styles.panel}>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>반복 주기</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {TYPE_OPTIONS.map((option) => {
                const selected = option.value === value.type;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleTypeChange(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`반복 주기 ${option.label}`}
                    style={[styles.chip, styles.typeChip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {value.type === "weekly" && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>반복 요일</Text>
              <View style={styles.row}>
                {WEEKDAY_LABELS.map((label, day) => {
                  const selected = (value.weekdays ?? []).includes(day);
                  return (
                    <Pressable
                      key={label}
                      onPress={() => handleWeekdayToggle(day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${label}요일`}
                      style={[
                        styles.chip,
                        styles.dayChip,
                        weekdayError && styles.chipError,
                        selected && styles.chipSelected,
                      ]}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {weekdayError && (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {WEEKDAY_REQUIRED_ERROR}
                </Text>
              )}
            </View>
          )}

          {value.type === "monthly" && startDay !== null && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{`매월 ${startDay}일에 반복됩니다 (시작일시 기준)`}</Text>
              {startDay >= 29 && (
                <Text style={styles.subCaption}>
                  31일이 없는 달은 해당 월 마지막 날에 생성됩니다
                </Text>
              )}
            </View>
          )}

          <View style={styles.group}>
            <Text style={styles.groupLabel}>반복 종료</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {END_OPTIONS.map((option) => {
                const selected = option.value === value.endType;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleEndTypeChange(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`반복 종료 ${option.label}`}
                    style={[styles.chip, styles.typeChip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {value.endType === "untilDate" && (
              <DateField
                label="반복 종료일"
                value={value.endDate ?? null}
                onChange={(endDate) => onChange({ ...value, endDate })}
              />
            )}
            {rangeText && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{rangeText}</Text>
              </View>
            )}
            {rangeError && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {rangeError}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
  },
  switchLabel: { fontSize: 14, color: colors.text.primary },
  textDisabled: { color: colors.text.tertiary },
  disabledHint: { fontSize: 12, color: colors.text.secondary },
  panel: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupLabel: { fontSize: 13, fontWeight: "600", color: colors.text.secondary },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    backgroundColor: colors.background.primary,
  },
  typeChip: { flex: 1 },
  dayChip: { flex: 1, minWidth: MIN_TOUCH_TARGET * 0.8 },
  chipSelected: {
    backgroundColor: colors.brand.tint,
    borderColor: colors.brand.strong,
  },
  chipError: { borderColor: colors.border.danger },
  chipLabel: { fontSize: 14, color: colors.text.secondary },
  chipLabelSelected: { color: colors.brand.strong, fontWeight: "600" },
  infoBox: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
  },
  infoText: { fontSize: 13, color: colors.brand.strong },
  subCaption: { fontSize: 12, color: colors.text.secondary },
  errorText: { fontSize: 12, color: colors.danger.text },
});

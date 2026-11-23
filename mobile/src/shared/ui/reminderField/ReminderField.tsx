import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  REMINDER_SETTING_OPTIONS,
  reminderSettingLabel,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

type ChipOption = { value: string; label: string };

interface ReminderChipsProps {
  options: ChipOption[];
  /** 선택된 option.value. 아직 모르면 null(아무것도 선택 표시하지 않음). */
  value: string | null;
  onChange: (value: string) => void;
  /** 접근성 라벨 앞에 붙는 말. 예: "마감 알림" → "마감 알림 10분 전". */
  accessibilityPrefix: string;
}

/**
 * 알림 시점 칩 줄. 알림 화면(기본값 설정)과 할 일 폼·상세(할 일별 재지정)가 함께 쓴다.
 * 선택지가 6~7개라 PriorityChips처럼 한 줄 세그먼트가 아니라 줄바꿈되는 칩으로 둔다.
 */
export const ReminderChips = ({ options, value, onChange, accessibilityPrefix }: ReminderChipsProps) => (
  <View style={styles.chips} accessibilityRole="radiogroup">
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          accessibilityLabel={`${accessibilityPrefix} ${option.label}`}
          style={({ pressed }) => [
            styles.chip,
            selected && styles.chipSelected,
            pressed && !selected && styles.chipPressed,
          ]}
        >
          <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

interface ReminderFieldProps {
  /** "default" | "off" | "0" | "10" | ... — 저장 전 parseReminderSetting으로 바꾼다(웹 todoForm과 동일). */
  value: string;
  onChange: (choice: string) => void;
  /** 사용자 기본값. 첫 선택지 라벨에 보여 준다. */
  defaultSetting: ReminderSetting;
}

/** 할 일별 마감 알림 선택. 첫 선택지는 사용자 기본값을 따르는 "default"다. */
export const ReminderField = ({ value, onChange, defaultSetting }: ReminderFieldProps) => (
  <ReminderChips
    options={[
      { value: "default", label: `기본값(${reminderSettingLabel(defaultSetting)})` },
      ...REMINDER_SETTING_OPTIONS,
    ]}
    value={value}
    onChange={onChange}
    accessibilityPrefix="마감 알림"
  />
);

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    backgroundColor: colors.background.primary,
  },
  chipSelected: { backgroundColor: colors.brand.tint, borderColor: colors.brand.strong },
  chipPressed: { backgroundColor: colors.background.secondary },
  chipLabel: { fontSize: 14, color: colors.text.secondary },
  chipLabelSelected: { color: colors.brand.strong, fontWeight: "600" },
});

import {
  REMINDER_OFFSETS,
  isReminderSetting,
  reminderSettingLabel,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";

/** 설정 select 옵션(기본값 선택지 없음). 할 일 폼은 앞에 "default"를 따로 붙인다. */
export const REMINDER_SETTING_OPTIONS: { value: string; label: string }[] = [
  { value: "off", label: reminderSettingLabel("off") },
  ...REMINDER_OFFSETS.map((offset) => ({ value: String(offset), label: reminderSettingLabel(offset) })),
];

/** 저장된 값 → select 값. 없음/null/이상한 값은 "default". */
export const toReminderChoice = (value: unknown): string =>
  isReminderSetting(value) ? String(value) : "default";

/** select 값 → 저장할 값. "default"와 이상한 값은 null(= 사용자 기본값을 따름). */
export const parseReminderSetting = (value: string | undefined): ReminderSetting | null => {
  if (value === "off") return "off";
  if (value === undefined || value === "" || value === "default") return null;
  const n = Number(value);
  return isReminderSetting(n) ? n : null;
};

/**
 * 마감 알림 공용 규칙. 웹 클라이언트, reminder-proxy Worker, (후속) 모바일이 함께 쓴다.
 * firebase를 import하지 않는다 — 클라이언트·Worker가 서브패스로 가져가도 번들이 가볍다.
 */
export declare const REMINDER_OFFSETS: readonly [0, 10, 30, 60, 1440];
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS)[number];
export type ReminderSetting = ReminderOffsetMinutes | "off";
export declare const DEFAULT_REMINDER_SETTING: ReminderSetting;
export declare const isReminderSetting: (value: unknown) => value is ReminderSetting;
/**
 * 실제 적용할 오프셋. 알림을 보내지 않으면 null.
 * - 사용자 기본값이 "off"면 할 일별 재지정과 무관하게 전체를 끈다.
 * - 할 일 값이 없음/null/이상한 값이면 사용자 기본값을 따른다.
 */
export declare const resolveReminderOffset: (todoValue: unknown, userDefault: unknown) => ReminderOffsetMinutes | null;
export declare const computeFireAt: (dueAtIso: string, offset: ReminderOffsetMinutes) => number;
export declare const reminderBody: (offset: ReminderOffsetMinutes) => string;
export declare const reminderSettingLabel: (setting: ReminderSetting) => string;

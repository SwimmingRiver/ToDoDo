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
/** 설정 select 옵션(기본값 선택지 없음). 할 일 폼은 앞에 "default"를 따로 붙인다. */
export declare const REMINDER_SETTING_OPTIONS: {
    value: string;
    label: string;
}[];
/** 저장된 값 → select 값. 없음/null/이상한 값은 "default". */
export declare const toReminderChoice: (value: unknown) => string;
/** select 값 → 저장할 값. "default"와 이상한 값은 null(= 사용자 기본값을 따름). */
export declare const parseReminderSetting: (value: string | undefined) => ReminderSetting | null;
/** 알림 기록용 상대 시각. 기록은 최대 7일이라 주·월 단위는 필요 없다. */
export declare const formatTimeAgo: (sentAt: number, now: number) => string;
export type ReminderFingerprintTodo = {
    id: string;
    dueAt: string | null;
    status: string;
    archived?: boolean;
    reminderOffsetMinutes?: unknown;
};
/** 알림 예약에 영향을 주는 값만 담은 지문. 제목 변경 같은 무관한 수정은 신호를 보내지 않는다. */
export declare const buildReminderFingerprint: (todos: ReminderFingerprintTodo[]) => string;

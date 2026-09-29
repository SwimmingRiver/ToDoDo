/**
 * 마감 알림 공용 규칙. 웹 클라이언트, reminder-proxy Worker, (후속) 모바일이 함께 쓴다.
 * firebase를 import하지 않는다 — 클라이언트·Worker가 서브패스로 가져가도 번들이 가볍다.
 */
export const REMINDER_OFFSETS = [0, 10, 30, 60, 1440];
export const DEFAULT_REMINDER_SETTING = 30;
export const isReminderSetting = (value) => value === "off" ||
    (typeof value === "number" && REMINDER_OFFSETS.includes(value));
/**
 * 실제 적용할 오프셋. 알림을 보내지 않으면 null.
 * - 사용자 기본값이 "off"면 할 일별 재지정과 무관하게 전체를 끈다.
 * - 할 일 값이 없음/null/이상한 값이면 사용자 기본값을 따른다.
 */
export const resolveReminderOffset = (todoValue, userDefault) => {
    const userSetting = isReminderSetting(userDefault) ? userDefault : DEFAULT_REMINDER_SETTING;
    if (userSetting === "off")
        return null;
    const setting = isReminderSetting(todoValue) ? todoValue : userSetting;
    return setting === "off" ? null : setting;
};
export const computeFireAt = (dueAtIso, offset) => Date.parse(dueAtIso) - offset * 60000;
export const reminderBody = (offset) => {
    if (offset === 0)
        return "지금 마감이에요";
    if (offset === 60)
        return "1시간 후 마감이에요";
    if (offset === 1440)
        return "내일 이 시간에 마감이에요";
    return `${offset}분 후 마감이에요`;
};
export const reminderSettingLabel = (setting) => {
    if (setting === "off")
        return "알림 없음";
    if (setting === 0)
        return "정각";
    if (setting === 60)
        return "1시간 전";
    if (setting === 1440)
        return "하루 전";
    return `${setting}분 전`;
};

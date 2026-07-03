import type { RecurrenceRule } from "../../types";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

// RecurrenceRule <-> RecurrenceFormValue 변환 (endDate: null <-> undefined 차이만 흡수)
export const toFormValue = (recurrence: RecurrenceRule | null): RecurrenceFormValue | null =>
  recurrence
    ? {
        type: recurrence.type,
        weekdays: recurrence.weekdays,
        endType: recurrence.endType,
        endDate: recurrence.endDate ?? undefined,
      }
    : null;

export const toRecurrenceRule = (value: RecurrenceFormValue | null): RecurrenceRule | null => {
  if (!value) return null;

  // weekdays는 optional 필드다. Firestore는 undefined 값을 가진 필드(중첩 객체 내부
  // 포함)를 만나면 즉시 에러를 던지므로, "값 없음"은 `undefined` 대입이 아니라
  // 키 자체를 생략하는 방식으로 표현해야 한다.
  const base = {
    type: value.type,
    endType: value.endType,
    endDate: value.endType === "untilDate" ? (value.endDate ?? null) : null,
  };

  return value.type === "weekly" ? { ...base, weekdays: value.weekdays } : base;
};

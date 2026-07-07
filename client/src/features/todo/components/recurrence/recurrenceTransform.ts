import { toDateKeyFromISO } from "@/shared/utils/date";
import type { RecurrenceRule } from "../../types";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

// RecurrenceRule -> RecurrenceFormValue. endType/endDate는 이제 사용자 입력이 아니라
// todo.dueAt으로부터 자동 유도되는 파생값이라(toRecurrenceRule 참고) 폼 상태로 들고
//있지 않는다.
export const toFormValue = (recurrence: RecurrenceRule | null): RecurrenceFormValue | null =>
  recurrence
    ? {
        type: recurrence.type,
        weekdays: recurrence.weekdays,
      }
    : null;

/**
 * dueAt(할 일 자체의 마감일시)이 있으면 "그 날짜까지 반복"(untilDate)으로, 없으면
 * 무기한(indefinite)으로 종료 조건을 자동 유도한다. 반복의 시작 앵커는 dueAt이 아니라
 * startAt이므로(todoApi.ts의 generateRecurringDueDates 호출부에서 처리), 여기서는
 * 종료 조건 계산만 담당한다.
 */
export const toRecurrenceRule = (
  value: RecurrenceFormValue | null,
  dueAt: string | null,
): RecurrenceRule | null => {
  if (!value) return null;

  // weekdays는 optional 필드다. Firestore는 undefined 값을 가진 필드(중첩 객체 내부
  // 포함)를 만나면 즉시 에러를 던지므로, "값 없음"은 `undefined` 대입이 아니라
  // 키 자체를 생략하는 방식으로 표현해야 한다.
  const base = {
    type: value.type,
    endType: dueAt ? ("untilDate" as const) : ("indefinite" as const),
    endDate: dueAt ? toDateKeyFromISO(dueAt) : null,
  };

  return value.type === "weekly" ? { ...base, weekdays: value.weekdays } : base;
};

import { toDateKeyFromISO } from "../insights/date";
import type { RecurrenceRule } from "../types/todo";

export interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[]; // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
}

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const WEEKDAY_REQUIRED_ERROR = "요일을 하나 이상 선택해주세요";

/** datetime-local 문자열에서 로컬 달력 날짜만 "YYYY-MM-DD" 키로 뽑아낸다. */
function toLocalDateKey(dateTimeStr: string): string | null {
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 반복 규칙 입력값의 유효성을 검사한다. 제출 차단 판단에 재사용하기 위해 컴포넌트와 분리했다.
 *
 * startAt은 반복의 시작 앵커, dueAt은 있으면 반복의 종료일 역할을 한다
 * (toRecurrenceRule 참고). 두 값이 모두 있을 때 dueAt이 startAt보다 이전이면
 * 반복 발생일이 하나도 생성되지 않는 상태가 되므로 제출을 막는다.
 */
export function getRecurrenceValidationError(
  value: RecurrenceFormValue | null,
  startAt: string | null,
  dueAt: string | null,
): string | null {
  if (!value) return null;

  if (value.type === "weekly" && (value.weekdays?.length ?? 0) === 0) {
    return WEEKDAY_REQUIRED_ERROR;
  }

  if (startAt && dueAt) {
    const startDateKey = toLocalDateKey(startAt);
    const dueDateKey = toLocalDateKey(dueAt);
    if (startDateKey && dueDateKey && dueDateKey < startDateKey) {
      return "마감일은 시작일과 같거나 이후여야 합니다";
    }
  }

  return null;
}

// RecurrenceRule -> RecurrenceFormValue. endType/endDate는 사용자 입력이 아니라
// todo.dueAt으로부터 자동 유도되는 파생값이라(toRecurrenceRule 참고) 폼 상태로 들고 있지 않는다.
export const toFormValue = (
  recurrence: RecurrenceRule | null | undefined,
): RecurrenceFormValue | null =>
  recurrence
    ? {
        type: recurrence.type,
        weekdays: recurrence.weekdays,
      }
    : null;

/**
 * dueAt(할 일 자체의 마감일시)이 있으면 "그 날짜까지 반복"(untilDate)으로, 없으면
 * 무기한(indefinite)으로 종료 조건을 자동 유도한다. 반복의 시작 앵커는 dueAt이 아니라
 * startAt이므로, 여기서는 종료 조건 계산만 담당한다.
 */
export const toRecurrenceRule = (
  value: RecurrenceFormValue | null,
  dueAt: string | null,
): RecurrenceRule | null => {
  if (!value) return null;

  // Firestore는 undefined 값을 가진 필드를 만나면 에러를 던지므로, "값 없음"은
  // `undefined` 대입이 아니라 키 자체를 생략하는 방식으로 표현해야 한다.
  const base = {
    type: value.type,
    endType: dueAt ? ("untilDate" as const) : ("indefinite" as const),
    endDate: dueAt ? toDateKeyFromISO(dueAt) : null,
  };

  return value.type === "weekly" ? { ...base, weekdays: value.weekdays } : base;
};

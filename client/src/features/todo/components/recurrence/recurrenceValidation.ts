import { WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

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
 * 반복 규칙 입력값의 유효성을 검사한다. todoForm/todoDetail의 onSubmit에서 제출 차단
 * 판단에 재사용하기 위해 컴포넌트 파일과 분리했다.
 *
 * startAt은 반복의 시작 앵커, dueAt은 있으면 반복의 종료일 역할을 한다
 * (recurrenceTransform.ts의 toRecurrenceRule 참고). 두 값이 모두 있을 때 dueAt이
 * startAt보다 이전이면 반복 발생일이 하나도 생성되지 않는 상태가 되므로 제출을 막는다.
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

import { WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

/** dueAt(시각 포함 datetime 문자열)에서 로컬 달력 날짜만 "YYYY-MM-DD" 키로 뽑아낸다. */
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
 * 판단에 재사용하기 위해 컴포넌트 파일과 분리했다 (react-refresh/only-export-components
 * 회피 + 인라인 에러 표시 로직과의 이중 관리 방지).
 */
export function getRecurrenceValidationError(
  value: RecurrenceFormValue | null,
  dueAt: string | null,
): string | null {
  if (!value) return null;

  if (value.type === "weekly" && (value.weekdays?.length ?? 0) === 0) {
    return WEEKDAY_REQUIRED_ERROR;
  }

  if (value.endType === "untilDate") {
    if (!value.endDate) return "종료일을 선택해주세요";
    if (dueAt) {
      // dueAt은 시각을 포함하고 endDate는 <input type="date">에서 온 시각 없는
      // "YYYY-MM-DD" 문자열이라, 그대로 new Date()로 비교하면 date-only 문자열이
      // UTC 자정으로 해석되어 "같은 날짜"인데도 시각 차이 때문에 종료일이 마감일보다
      // 이전으로 잘못 판정될 수 있다. 달력 날짜(YYYY-MM-DD) 문자열 비교로 이를 피한다.
      const dueDateKey = toLocalDateKey(dueAt);
      if (dueDateKey && value.endDate < dueDateKey) {
        return "종료일은 마감일 이후여야 합니다";
      }
    }
  }

  return null;
}

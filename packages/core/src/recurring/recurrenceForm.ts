import type { RecurrenceRule } from "../types/todo";

export interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[]; // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
  endType: "indefinite" | "untilDate";
  endDate: string | null; // "YYYY-MM-DD" (로컬 날짜 키), endType==="untilDate"일 때만 의미 있음
}

/** 반복을 새로 켤 때의 기본값. 소비자는 펼쳐서 복사해 쓴다. */
export const DEFAULT_RECURRENCE_FORM_VALUE: RecurrenceFormValue = {
  type: "daily",
  endType: "indefinite",
  endDate: null,
};

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const WEEKDAY_REQUIRED_ERROR = "요일을 하나 이상 선택해주세요";
export const END_DATE_REQUIRED_ERROR = "종료일을 선택해주세요";
export const END_DATE_BEFORE_START_ERROR = "종료일은 시작일과 같거나 이후여야 합니다";

/** 반복 규칙의 endDate는 "YYYY-MM-DD"로 저장된다. */
export const isDateOnlyKey = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

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
 * startAt은 반복의 시작 앵커이며, 종료일은 그 날짜와 같거나 이후여야 한다.
 */
export function getRecurrenceValidationError(
  value: RecurrenceFormValue | null,
  startAt: string | null,
): string | null {
  if (!value) return null;

  if (value.type === "weekly" && (value.weekdays?.length ?? 0) === 0) {
    return WEEKDAY_REQUIRED_ERROR;
  }

  if (value.endType === "untilDate") {
    if (!value.endDate) return END_DATE_REQUIRED_ERROR;
    const startDateKey = startAt ? toLocalDateKey(startAt) : null;
    if (startDateKey && value.endDate < startDateKey) return END_DATE_BEFORE_START_ERROR;
  }

  return null;
}

/**
 * RecurrenceRule -> RecurrenceFormValue. 옛 문서(endType 없음)는 무기한으로 본다.
 * untilDate인데 endDate가 없거나 형식이 다르면 endDate는 null로 둔다 — 조용히 무기한으로
 * 바꾸지 않고, 저장 시 검증이 종료일 입력을 요구하게 한다.
 */
export const toFormValue = (
  recurrence: RecurrenceRule | null | undefined,
): RecurrenceFormValue | null => {
  if (!recurrence) return null;
  const endType = recurrence.endType === "untilDate" ? "untilDate" : "indefinite";
  return {
    type: recurrence.type,
    ...(recurrence.weekdays ? { weekdays: recurrence.weekdays } : {}),
    endType,
    endDate: endType === "untilDate" && isDateOnlyKey(recurrence.endDate) ? recurrence.endDate : null,
  };
};

export const toRecurrenceRule = (
  value: RecurrenceFormValue | null,
): RecurrenceRule | null => {
  if (!value) return null;

  // Firestore는 undefined 값을 가진 필드를 만나면 에러를 던지므로, "값 없음"은
  // `undefined` 대입이 아니라 키 자체를 생략하는 방식으로 표현해야 한다.
  const base = {
    type: value.type,
    endType: value.endType,
    endDate: value.endType === "untilDate" ? value.endDate : null,
  };

  return value.type === "weekly" ? { ...base, weekdays: value.weekdays } : base;
};

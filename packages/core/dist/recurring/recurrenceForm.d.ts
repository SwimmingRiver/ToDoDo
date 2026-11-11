import type { RecurrenceRule } from "../types/todo";
export interface RecurrenceFormValue {
    type: "daily" | "weekly" | "monthly";
    weekdays?: number[];
    endType: "indefinite" | "untilDate";
    endDate: string | null;
}
/** 반복을 새로 켤 때의 기본값. 소비자는 펼쳐서 복사해 쓴다. */
export declare const DEFAULT_RECURRENCE_FORM_VALUE: RecurrenceFormValue;
export declare const WEEKDAY_LABELS: string[];
export declare const WEEKDAY_REQUIRED_ERROR = "\uC694\uC77C\uC744 \uD558\uB098 \uC774\uC0C1 \uC120\uD0DD\uD574\uC8FC\uC138\uC694";
export declare const END_DATE_REQUIRED_ERROR = "\uC885\uB8CC\uC77C\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694";
export declare const END_DATE_BEFORE_START_ERROR = "\uC885\uB8CC\uC77C\uC740 \uC2DC\uC791\uC77C\uACFC \uAC19\uAC70\uB098 \uC774\uD6C4\uC5EC\uC57C \uD569\uB2C8\uB2E4";
/** 반복 규칙의 endDate는 "YYYY-MM-DD"로 저장된다. */
export declare const isDateOnlyKey: (value: string | null | undefined) => value is string;
/**
 * 반복 규칙 입력값의 유효성을 검사한다. 제출 차단 판단에 재사용하기 위해 컴포넌트와 분리했다.
 * startAt은 반복의 시작 앵커이며, 종료일은 그 날짜와 같거나 이후여야 한다.
 */
export declare function getRecurrenceValidationError(value: RecurrenceFormValue | null, startAt: string | null): string | null;
/**
 * RecurrenceRule -> RecurrenceFormValue. 옛 문서(endType 없음)는 무기한으로 본다.
 * untilDate인데 endDate가 없거나 형식이 다르면 endDate는 null로 둔다 — 조용히 무기한으로
 * 바꾸지 않고, 저장 시 검증이 종료일 입력을 요구하게 한다.
 */
export declare const toFormValue: (recurrence: RecurrenceRule | null | undefined) => RecurrenceFormValue | null;
export declare const toRecurrenceRule: (value: RecurrenceFormValue | null) => RecurrenceRule | null;

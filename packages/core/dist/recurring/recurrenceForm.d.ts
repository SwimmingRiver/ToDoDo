import type { RecurrenceRule } from "../types/todo";
export interface RecurrenceFormValue {
    type: "daily" | "weekly" | "monthly";
    weekdays?: number[];
}
export declare const WEEKDAY_LABELS: string[];
export declare const WEEKDAY_REQUIRED_ERROR = "\uC694\uC77C\uC744 \uD558\uB098 \uC774\uC0C1 \uC120\uD0DD\uD574\uC8FC\uC138\uC694";
/**
 * 반복 규칙 입력값의 유효성을 검사한다. 제출 차단 판단에 재사용하기 위해 컴포넌트와 분리했다.
 *
 * startAt은 반복의 시작 앵커, dueAt은 있으면 반복의 종료일 역할을 한다
 * (toRecurrenceRule 참고). 두 값이 모두 있을 때 dueAt이 startAt보다 이전이면
 * 반복 발생일이 하나도 생성되지 않는 상태가 되므로 제출을 막는다.
 */
export declare function getRecurrenceValidationError(value: RecurrenceFormValue | null, startAt: string | null, dueAt: string | null): string | null;
export declare const toFormValue: (recurrence: RecurrenceRule | null | undefined) => RecurrenceFormValue | null;
/**
 * dueAt(할 일 자체의 마감일시)이 있으면 "그 날짜까지 반복"(untilDate)으로, 없으면
 * 무기한(indefinite)으로 종료 조건을 자동 유도한다. 반복의 시작 앵커는 dueAt이 아니라
 * startAt이므로, 여기서는 종료 조건 계산만 담당한다.
 */
export declare const toRecurrenceRule: (value: RecurrenceFormValue | null, dueAt: string | null) => RecurrenceRule | null;
/**
 * 이미 반복 중인 시리즈를 수정할 때 쓰는 규칙 변환. 수정 폼의 dueAt은 시리즈 종료일이
 * 아니라 "지금 수정 중인 회차의 날짜"다. 이를 toRecurrenceRule에 넣으면 그 회차 날짜가
 * 종료일(untilDate)로 바뀌어, editRecurringSeries가 미래 회차를 지운 뒤 그 날짜까지만
 * 다시 만들어 무기한 시리즈가 잘린다. 그래서 종료 조건(endType/endDate)은 기존 규칙에서
 * 그대로 가져오고, 사용자가 바꿀 수 있는 주기/요일만 폼 값에서 가져온다.
 */
export declare const toRecurrenceRuleForEdit: (value: RecurrenceFormValue | null, existing: RecurrenceRule) => RecurrenceRule | null;

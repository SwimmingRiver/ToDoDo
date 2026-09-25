import type { Todo } from "../types/todo";
export type PeriodPreset = "thisWeek" | "thisMonth" | "last90Days" | "all";
export interface InsightsFilter {
    period: PeriodPreset;
    /** 루트 할 일(parentId === null) id. null이면 전체 프로젝트. */
    projectId: string | null;
}
/** 로컬 날짜 키 범위, 양끝 포함. `all`이면 null. */
export type PeriodRange = {
    startKey: string;
    endKey: string;
} | null;
export declare const DEFAULT_INSIGHTS_FILTER: InsightsFilter;
/**
 * 프리셋 → 날짜 키 범위. 주 시작은 일요일(대시보드 캘린더의 FullCalendar 기본값과
 * 일치). 모든 범위는 오늘(now)로 끝난다.
 */
export declare const resolvePeriodRange: (period: PeriodPreset, now?: Date) => PeriodRange;
/** yyyy-MM-dd는 사전순 == 시간순이라 문자열 비교로 충분하다. */
export declare const isKeyInRange: (key: string, range: PeriodRange) => boolean;
/** 루트 자신 + 그 직계 자식만 남긴다. null이면 입력 배열을 그대로 돌려준다. */
export declare const scopeTodosByProject: (todos: Todo[], projectId: string | null) => Todo[];
/**
 * 기간 소속 판단 규칙(모든 기간 지표가 공유): dueAt(없으면 doneAt)이 범위 안이면
 * 포함. "이 기간에 처리했어야 할 일"을 뜻하기 위해 dueAt을 우선한다. 둘 다 없는
 * 항목(기한 없이 만들고 아직 완료 전)은 기간이 있으면 제외, `all`이면 포함.
 */
export declare const scopeTodosByRange: (todos: Todo[], range: PeriodRange) => Todo[];

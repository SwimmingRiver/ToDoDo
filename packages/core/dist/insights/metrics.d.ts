import type { Todo } from "../types/todo";
import { type PeriodRange } from "./filter";
export interface CompletionRateResult {
    completed: number;
    total: number;
    /** total이 0이면 0. */
    rate: number;
}
/** 기간 내 완료율. 기간 소속 규칙은 scopeTodosByRange 참고. */
export declare const computeCompletionRate: (todos: Todo[], range: PeriodRange) => CompletionRateResult;
/**
 * 오늘부터 거꾸로 센 연속 완료일 수. 오늘 아직 완료가 없어도 어제까지 이어진
 * 스트릭은 끊지 않는다(오늘이 아직 안 끝났을 뿐일 수 있음). 기간/프로젝트 필터와
 * 무관하게 항상 전체 todos·전체 기간으로 계산한다 — 프로젝트별 연속 달성일은
 * 의미가 약하다.
 */
export declare const computeStreak: (todos: Todo[], now?: Date) => number;
export interface PriorityDistribution {
    low: number;
    medium: number;
    high: number;
}
/** 범위 안 완료 항목만 대상으로 우선순위별 개수. */
export declare const computePriorityDistribution: (todos: Todo[], range: PeriodRange) => PriorityDistribution;
/**
 * 반복 vs 단발 완료율. 레거시 문서는 recurrence 필드 자체가 없어 undefined일 수
 * 있으므로 loose null 체크(`!= null`)로 "반복"을 판단한다.
 */
export declare const computeRecurringVsOneOffRate: (todos: Todo[], range: PeriodRange) => {
    recurring: CompletionRateResult;
    oneOff: CompletionRateResult;
};
/** 기한 준수율 — dueAt·doneAt이 모두 있는 범위 안 완료 항목 중 마감 이내에 끝낸 비율. */
export declare const computeDueAdherence: (todos: Todo[], range: PeriodRange) => CompletionRateResult;
export interface StatusBreakdown {
    todo: number;
    doing: number;
    done: number;
}
/**
 * 프로젝트의 현재 상태 구성. 기간 필터를 타지 않는다("지금 어디쯤인가"). 루트의
 * status는 자식에서 도출되는 값이라 이중 계산을 피하려 자식만 세고, 자식이 없는
 * 루트면 루트 자신 1건을 센다.
 */
export declare const computeStatusBreakdown: (projectScopedTodos: Todo[], projectId: string) => StatusBreakdown;
export interface ProjectOption {
    id: string;
    title: string;
    isDone: boolean;
}
/** 프로젝트 select 옵션: 루트만, 진행 중 먼저 → 완료 순, 각 그룹은 updatedAt 내림차순. */
export declare const listProjectOptions: (todos: Todo[]) => ProjectOption[];

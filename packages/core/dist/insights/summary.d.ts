import type { Todo } from "../types/todo";
import { type CompletionRateResult, type PriorityDistribution, type ProjectOption, type StatusBreakdown } from "./metrics";
import { type InsightsFilter } from "./filter";
import { type TrendBucket } from "./trend";
export interface InsightsMetrics {
    completionRate: CompletionRateResult;
    dueAdherence: CompletionRateResult;
    recurringVsOneOff: {
        recurring: CompletionRateResult;
        oneOff: CompletionRateResult;
    };
    priorityDistribution: PriorityDistribution;
    trend: TrendBucket[];
    streak: number;
    /** projectId가 null(전체 프로젝트)이면 null. */
    statusBreakdown: StatusBreakdown | null;
    projects: ProjectOption[];
}
/**
 * 필터(기간 프리셋 × 프로젝트)로 모든 인사이트 지표를 한 번에 계산한다.
 * 스트릭·프로젝트 목록만 필터와 무관하게 전체 todos 기준이다.
 */
export declare const computeInsightsMetrics: (todos: Todo[], filter: InsightsFilter, now?: Date) => InsightsMetrics;

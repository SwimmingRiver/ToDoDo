import { computeCompletionRate, computeDueAdherence, computePriorityDistribution, computeRecurringVsOneOffRate, computeStatusBreakdown, computeStreak, listProjectOptions, } from "./metrics";
import { resolvePeriodRange, scopeTodosByProject } from "./filter";
import { bucketCompletions, resolveTrendGranularity } from "./trend";
/**
 * 필터(기간 프리셋 × 프로젝트)로 모든 인사이트 지표를 한 번에 계산한다.
 * 스트릭·프로젝트 목록만 필터와 무관하게 전체 todos 기준이다.
 */
export const computeInsightsMetrics = (todos, filter, now = new Date()) => {
    const all = todos;
    const range = resolvePeriodRange(filter.period, now);
    const granularity = resolveTrendGranularity(filter.period);
    const scoped = scopeTodosByProject(all, filter.projectId);
    return {
        completionRate: computeCompletionRate(scoped, range),
        dueAdherence: computeDueAdherence(scoped, range),
        recurringVsOneOff: computeRecurringVsOneOffRate(scoped, range),
        priorityDistribution: computePriorityDistribution(scoped, range),
        trend: bucketCompletions(scoped, range, granularity, now),
        streak: computeStreak(all, now),
        statusBreakdown: filter.projectId === null ? null : computeStatusBreakdown(scoped, filter.projectId),
        projects: listProjectOptions(all),
    };
};

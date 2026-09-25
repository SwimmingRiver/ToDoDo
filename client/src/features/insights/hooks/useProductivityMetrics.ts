import { useMemo } from "react";
import {
  bucketCompletions,
  computeCompletionRate,
  computeDueAdherence,
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeStatusBreakdown,
  computeStreak,
  listProjectOptions,
  resolvePeriodRange,
  resolveTrendGranularity,
  scopeTodosByProject,
  type InsightsFilter,
} from "@tododo/core";
import { useTodosForStats } from "./useTodosForStats";

/**
 * 필터(기간 프리셋 × 프로젝트)를 받아 모든 지표를 계산한다. Firestore 조회는
 * useTodosForStats가 전체 이력을 1회 가져오고, 필터링·계산은 여기 useMemo에서
 * core 순수 함수로 처리한다 — 필터를 바꿔도 네트워크 요청이 없다.
 * 스트릭만 필터와 무관하게 전체 기준이다(computeStreak 주석 참고).
 */
export const useProductivityMetrics = (filter: InsightsFilter) => {
  const { data: todos, isLoading, isError } = useTodosForStats();

  const metrics = useMemo(() => {
    const all = todos ?? [];
    const now = new Date();
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
  }, [todos, filter.period, filter.projectId]);

  return { ...metrics, isLoading, isError };
};

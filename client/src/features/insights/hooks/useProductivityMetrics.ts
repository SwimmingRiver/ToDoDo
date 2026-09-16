import { useMemo } from "react";
import { useTodosForStats } from "./useTodosForStats";
import { computeCompletionRate } from "../utils/computeCompletionRate";
import { computeStreak } from "../utils/computeStreak";
import {
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeDueAdherence,
} from "../utils/computeDistribution";
import { computeCompletionTrend } from "../utils/computeCompletionTrend";

const TREND_DAYS = 14;

export const useProductivityMetrics = () => {
  const { data: todos, isLoading, isError } = useTodosForStats();

  const metrics = useMemo(() => {
    const list = todos ?? [];
    return {
      completionRate7d: computeCompletionRate(list, { days: 7 }),
      completionRate30d: computeCompletionRate(list, { days: 30 }),
      completionRateAll: computeCompletionRate(list),
      streak: computeStreak(list),
      priorityDistribution: computePriorityDistribution(list),
      recurringVsOneOff: computeRecurringVsOneOffRate(list),
      dueAdherence: computeDueAdherence(list),
      trend: computeCompletionTrend(list, TREND_DAYS),
    };
  }, [todos]);

  return { ...metrics, isLoading, isError };
};

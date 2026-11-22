import { useMemo } from "react";
import { computeInsightsMetrics, type InsightsFilter, type InsightsMetrics } from "@tododo/core";
import { useTodosForStats } from "./useTodosForStats";

export type UseInsightsMetricsResult = InsightsMetrics & {
  isLoading: boolean;
  hasData: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
  isRefetching: boolean;
};

export const useInsightsMetrics = (filter: InsightsFilter): UseInsightsMetricsResult => {
  const { data, isLoading, isError, refetch, isRefetching } = useTodosForStats();
  const metrics = useMemo(
    () => computeInsightsMetrics(data ?? [], filter, new Date()),
    [data, filter],
  );
  return { ...metrics, isLoading, hasData: data !== undefined, isError, refetch, isRefetching };
};

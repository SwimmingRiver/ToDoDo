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
  const { data, isLoading, isError, refetch, isRefetching, dataUpdatedAt } = useTodosForStats();
  // dataUpdatedAt: 데이터가 같아도 새로 읽을 때마다 now를 다시 잡아 날짜 경계를 반영한다.
  const metrics = useMemo(
    () => computeInsightsMetrics(data ?? [], filter, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filter, dataUpdatedAt],
  );
  return { ...metrics, isLoading, hasData: data !== undefined, isError, refetch, isRefetching };
};

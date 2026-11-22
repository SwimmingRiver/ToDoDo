import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AlertCircle } from "lucide-react-native";
import { DEFAULT_INSIGHTS_FILTER, PERIOD_TITLE_LABELS, type InsightsFilter } from "@tododo/core";
import { useInsightsMetrics } from "../insights";
import {
  CompletionTrendCard,
  InsightsFilterBar,
  InsightsLockedNotice,
  InsightsSkeleton,
  PriorityDistributionCard,
  StatusBreakdownCard,
  StreakCard,
  SummaryCards,
} from "../insights/components";
import { useIsPremium } from "../premium";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const InsightsScreen = () => {
  const navigation = useNavigation<{ navigate: (name: "Account") => void }>();
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  // filter 참조가 안정적이어야 useInsightsMetrics의 useMemo가 유지된다.
  const [filter, setFilter] = useState<InsightsFilter>(DEFAULT_INSIGHTS_FILTER);
  const metrics = useInsightsMetrics(filter);
  const [refreshing, setRefreshing] = useState(false);
  const periodLabel = PERIOD_TITLE_LABELS[filter.period];

  // 선택한 프로젝트가 삭제되는 등 옵션에서 사라지면 전체로 되돌린다.
  const { projectId } = filter;
  const { projects } = metrics;
  useEffect(() => {
    if (projectId !== null && !projects.some((project) => project.id === projectId)) {
      setFilter((prev) => ({ ...prev, projectId: null }));
    }
  }, [projectId, projects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await metrics.refetch();
    } catch {
      // 실패해도 기존 데이터를 유지하고 스피너만 해제한다.
    } finally {
      setRefreshing(false);
    }
  }, [metrics]);

  const renderBody = () => {
    if (isEntitlementLoading) return <InsightsSkeleton />;
    if (!isPremium) return <InsightsLockedNotice onSubscribe={() => navigation.navigate("Account")} />;
    if (metrics.isLoading) return <InsightsSkeleton />;
    if (metrics.isError && !metrics.hasData) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="통계를 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      );
    }
    return (
      <ScrollView
        testID="insights-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <InsightsFilterBar filter={filter} projects={metrics.projects} onChange={setFilter} />
        <StreakCard streak={metrics.streak} />
        <SummaryCards
          periodLabel={periodLabel}
          completionRate={metrics.completionRate}
          dueAdherence={metrics.dueAdherence}
          recurringVsOneOff={metrics.recurringVsOneOff}
        />
        {metrics.statusBreakdown && <StatusBreakdownCard breakdown={metrics.statusBreakdown} />}
        <PriorityDistributionCard
          distribution={metrics.priorityDistribution}
          title={`${periodLabel} 완료한 할 일의 우선순위 분포`}
        />
        <CompletionTrendCard buckets={metrics.trend} title={`${periodLabel} 완료 추이`} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {renderBody()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.primary, padding: spacing.lg },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
});

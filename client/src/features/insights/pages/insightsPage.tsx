import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { DEFAULT_INSIGHTS_FILTER, PERIOD_TITLE_LABELS, type InsightsFilter } from "@tododo/core";
import { useIsPremium, useUpgradeInterest, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
import { EmptyState } from "@/shared";
import InsightsSkeleton from "@/shared/ui/skeleton/insightsSkeleton";
import { useProductivityMetrics } from "../hooks";
import {
  InsightsFilterBar,
  InsightsSummaryCards,
  StreakCard,
  PriorityDistribution,
  CompletionTrend,
  StatusBreakdownCard,
} from "../components";
import { PageContainer, InsightsBody, SecondaryGrid } from "./insightsPage.styles";

const InsightsPage = () => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const [filter, setFilter] = useState<InsightsFilter>(DEFAULT_INSIGHTS_FILTER);
  const metrics = useProductivityMetrics(filter);
  const { submitInterest } = useUpgradeInterest("완료 통계/인사이트 기능");
  const periodLabel = PERIOD_TITLE_LABELS[filter.period];

  // 선택한 프로젝트가 삭제되는 등 옵션에서 사라지면 전체로 되돌린다.
  const { projectId } = filter;
  const { projects } = metrics;
  useEffect(() => {
    if (projectId !== null && !projects.some((project) => project.id === projectId)) {
      setFilter((prev) => ({ ...prev, projectId: null }));
    }
  }, [projectId, projects]);

  if (isEntitlementLoading) return <InsightsSkeleton />;

  const renderContent = () => {
    if (metrics.isLoading) return <InsightsSkeleton />;
    if (metrics.isError) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="통계를 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      );
    }
    return (
      <>
        <InsightsFilterBar filter={filter} projects={metrics.projects} onChange={setFilter} />
        <StreakCard streak={metrics.streak} />
        <InsightsSummaryCards
          periodLabel={periodLabel}
          completionRate={metrics.completionRate}
          dueAdherence={metrics.dueAdherence}
          recurringVsOneOff={metrics.recurringVsOneOff}
        />
        {metrics.statusBreakdown && <StatusBreakdownCard breakdown={metrics.statusBreakdown} />}
        <SecondaryGrid>
          <PriorityDistribution distribution={metrics.priorityDistribution} title={`${periodLabel} 완료한 할 일의 우선순위 분포`} />
          <CompletionTrend buckets={metrics.trend} title={`${periodLabel} 완료 추이`} />
        </SecondaryGrid>
      </>
    );
  };

  return (
    <PageContainer>
      <InsightsBody>
        <PremiumGate
          isPremium={isPremium}
          fallback={
            <PremiumLockedNotice
              title="완료 통계는 프리미엄 기능입니다"
              description="완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다"
              ctaLabel="관심 있어요"
              onCtaClick={submitInterest}
            />
          }
        >
          {renderContent()}
        </PremiumGate>
      </InsightsBody>
    </PageContainer>
  );
};

export default InsightsPage;

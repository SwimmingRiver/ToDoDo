import { AlertCircle } from "lucide-react";
import { useIsPremium, useUpgradeInterest, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
import { EmptyState } from "@/shared";
import InsightsSkeleton from "@/shared/ui/skeleton/insightsSkeleton";
import { useProductivityMetrics } from "../hooks";
import { InsightsSummaryCards, StreakCard, PriorityDistribution, CompletionTrend } from "../components";
import { PageContainer, InsightsBody, SecondaryGrid } from "./insightsPage.styles";

const InsightsPage = () => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const metrics = useProductivityMetrics();
  const { submitInterest } = useUpgradeInterest("완료 통계/인사이트 기능");

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
        <StreakCard streak={metrics.streak} />
        <InsightsSummaryCards
          completionRate7d={metrics.completionRate7d}
          completionRate30d={metrics.completionRate30d}
          dueAdherence={metrics.dueAdherence}
          recurringVsOneOff={metrics.recurringVsOneOff}
        />
        <SecondaryGrid>
          <PriorityDistribution distribution={metrics.priorityDistribution} />
          <CompletionTrend trend={metrics.trend} />
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

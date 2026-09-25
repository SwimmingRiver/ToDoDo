import { BarChart3 } from "lucide-react";
import type { TrendBucket } from "@tododo/core";
import { EmptyState, useElementWidth } from "@/shared";
import { BarChart } from "./charts";
import { Card, Title, ChartArea } from "./completionTrend.styles";

interface CompletionTrendProps {
  buckets: TrendBucket[];
  /** "이번 달 완료 추이"처럼 필터를 반영한 제목. */
  title: string;
}

const formatBarTitle = (label: string, value: number) => `${label}: ${value}건 완료`;

const CompletionTrend = ({ buckets, title }: CompletionTrendProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const points = buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }));
  const max = Math.max(0, ...points.map((p) => p.value));
  const isEmpty = buckets.length === 0 || max === 0;

  return (
    <Card>
      <Title>{title}</Title>
      {isEmpty ? (
        <EmptyState icon={BarChart3} title="이 기간에 기록이 없습니다" description="할 일을 완료하면 여기에 추이가 쌓입니다" />
      ) : (
        <ChartArea ref={ref}>
          <BarChart points={points} width={width} ariaLabel={`${title}, 최대 ${max}건`} formatTitle={formatBarTitle} />
        </ChartArea>
      )}
    </Card>
  );
};

export default CompletionTrend;
export type { CompletionTrendProps };

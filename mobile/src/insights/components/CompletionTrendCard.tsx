import { Text, View } from "react-native";
import { BarChart3 } from "lucide-react-native";
import type { TrendBucket } from "@tododo/core";
import { EmptyState } from "../../shared/ui/emptyState/EmptyState";
import { BarChart } from "../charts/BarChart";
import { useMeasuredWidth } from "../charts/useMeasuredWidth";
import { cardStyles } from "./cardStyles";

interface CompletionTrendCardProps {
  buckets: TrendBucket[];
  /** "이번 달 완료 추이"처럼 필터를 반영한 제목. */
  title: string;
}

export const CompletionTrendCard = ({ buckets, title }: CompletionTrendCardProps) => {
  const { width, onLayout } = useMeasuredWidth();
  const points = buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }));
  const max = Math.max(0, ...points.map((p) => p.value));
  const isEmpty = buckets.length === 0 || max === 0;

  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title}</Text>
      {isEmpty ? (
        <EmptyState icon={BarChart3} title="이 기간에 기록이 없습니다" description="할 일을 완료하면 여기에 추이가 쌓입니다" />
      ) : (
        <View onLayout={onLayout}>
          <BarChart points={points} width={width} accessibilityLabel={`${title}, 최대 ${max}건`} />
        </View>
      )}
    </View>
  );
};

export type { CompletionTrendCardProps };

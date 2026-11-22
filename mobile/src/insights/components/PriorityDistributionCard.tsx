import { Text, View } from "react-native";
import type { PriorityDistribution } from "@tododo/core";
import { HorizontalBars } from "../charts/HorizontalBars";
import { useMeasuredWidth } from "../charts/useMeasuredWidth";
import { cardStyles } from "./cardStyles";

interface PriorityDistributionCardProps {
  distribution: PriorityDistribution;
  title: string;
}

export const PriorityDistributionCard = ({ distribution, title }: PriorityDistributionCardProps) => {
  const { width, onLayout } = useMeasuredWidth();
  const rows = [
    { label: "높음", value: distribution.high },
    { label: "보통", value: distribution.medium },
    { label: "낮음", value: distribution.low },
  ];

  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title}</Text>
      <View onLayout={onLayout}>
        <HorizontalBars rows={rows} width={width} accessibilityLabel={title} />
      </View>
    </View>
  );
};

export type { PriorityDistributionCardProps };

import type { PriorityDistribution as PriorityDistributionData } from "@tododo/core";
import { useElementWidth } from "@/shared";
import { HorizontalBars } from "./charts";
import { Card, Title, ChartArea } from "./priorityDistribution.styles";

interface PriorityDistributionProps {
  distribution: PriorityDistributionData;
  title: string;
}

const PriorityDistribution = ({ distribution, title }: PriorityDistributionProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const rows = [
    { label: "높음", value: distribution.high },
    { label: "보통", value: distribution.medium },
    { label: "낮음", value: distribution.low },
  ];

  return (
    <Card>
      <Title>{title}</Title>
      <ChartArea ref={ref}>
        <HorizontalBars rows={rows} width={width} ariaLabel={title} />
      </ChartArea>
    </Card>
  );
};

export default PriorityDistribution;
export type { PriorityDistributionProps };

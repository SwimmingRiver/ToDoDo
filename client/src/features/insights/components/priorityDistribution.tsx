import type { PriorityDistribution as PriorityDistributionData } from "../utils/computeDistribution";
import { Card, Title, Row, RowLabel, BarTrack, BarFill, RowCount } from "./priorityDistribution.styles";

interface PriorityDistributionProps {
  distribution: PriorityDistributionData;
}

const ROWS: { key: keyof PriorityDistributionData; label: string }[] = [
  { key: "high", label: "높음" },
  { key: "medium", label: "보통" },
  { key: "low", label: "낮음" },
];

const PriorityDistribution = ({ distribution }: PriorityDistributionProps) => {
  const max = Math.max(distribution.high, distribution.medium, distribution.low, 1);

  return (
    <Card>
      <Title>완료한 할 일의 우선순위 분포</Title>
      {ROWS.map(({ key, label }) => {
        const count = distribution[key];
        return (
          <Row key={key}>
            <RowLabel>{label}</RowLabel>
            <BarTrack>
              <BarFill style={{ width: `${(count / max) * 100}%` }} />
            </BarTrack>
            <RowCount>{count}</RowCount>
          </Row>
        );
      })}
    </Card>
  );
};

export default PriorityDistribution;
export type { PriorityDistributionProps };

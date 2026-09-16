import type { TrendPoint } from "../utils/computeCompletionTrend";
import { Card, Title, ChartRow, Column, BarTrack, Bar, DateLabel } from "./completionTrend.styles";

interface CompletionTrendProps {
  trend: TrendPoint[];
}

/** "yyyy-MM-dd" -> "M/d". 라벨이 촘촘해 보이지 않게 짧게 줄인다. */
const toShortLabel = (dateKey: string): string => {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
};

const CompletionTrend = ({ trend }: CompletionTrendProps) => {
  const max = Math.max(...trend.map((point) => point.count), 1);
  // 라벨이 다 붙으면 좁은 화면에서 서로 겹치므로 3일 간격 + 마지막 날만 보여준다.
  const isLabelVisible = (index: number) => index % 3 === 0 || index === trend.length - 1;

  return (
    <Card>
      <Title>최근 {trend.length}일 완료 추이</Title>
      <ChartRow>
        {trend.map((point, index) => (
          <Column key={point.date}>
            <BarTrack>
              <Bar
                style={{ height: `${(point.count / max) * 100}%` }}
                title={`${point.date}: ${point.count}건 완료`}
              />
            </BarTrack>
            <DateLabel>{isLabelVisible(index) ? toShortLabel(point.date) : ""}</DateLabel>
          </Column>
        ))}
      </ChartRow>
    </Card>
  );
};

export default CompletionTrend;
export type { CompletionTrendProps };

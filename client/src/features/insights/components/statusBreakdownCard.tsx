import type { StatusBreakdown } from "@tododo/core";
import { useElementWidth } from "@/shared";
import { statusColors, type Status } from "@/styles/statusColors";
import { StackedBar } from "./charts";
import { Card, Title, ChartArea, Legend, LegendItem, LegendDot, Hint } from "./statusBreakdownCard.styles";

interface StatusBreakdownCardProps {
  breakdown: StatusBreakdown;
}

const STATUS_ORDER: { key: Status; label: string }[] = [
  { key: "todo", label: "할 일" },
  { key: "doing", label: "진행 중" },
  { key: "done", label: "완료" },
];

const colorOf = (key: string) => statusColors[key as Status].main;

/** 선택한 프로젝트의 현재 상태 구성. 색만으로 구분하지 않도록 범례에 건수를 병기한다. */
const StatusBreakdownCard = ({ breakdown }: StatusBreakdownCardProps) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const segments = STATUS_ORDER.map(({ key, label }) => ({ key, label, value: breakdown[key] }));
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <Title>프로젝트 상태 구성</Title>
      {total === 0 ? (
        <Hint>하위 할 일이 없습니다</Hint>
      ) : (
        <>
          <ChartArea ref={ref}>
            <StackedBar segments={segments} colorOf={colorOf} width={width} ariaLabel={`프로젝트 상태 구성, 총 ${total}건`} />
          </ChartArea>
          <Legend>
            {segments.map((segment) => (
              <LegendItem key={segment.key}>
                <LegendDot $color={colorOf(segment.key)} aria-hidden="true" />
                {`${segment.label} ${segment.value}`}
              </LegendItem>
            ))}
          </Legend>
        </>
      )}
    </Card>
  );
};

export default StatusBreakdownCard;
export type { StatusBreakdownCardProps };

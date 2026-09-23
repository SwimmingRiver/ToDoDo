import type { CompletionRateResult } from "@tododo/core";
import { Grid, Card, Label, Value, Sub } from "./insightsSummaryCards.styles";

interface InsightsSummaryCardsProps {
  /** "이번 달" 같은 기간 접두사. 카드 제목이 필터를 따라가게 한다. */
  periodLabel: string;
  completionRate: CompletionRateResult;
  dueAdherence: CompletionRateResult;
  recurringVsOneOff: { recurring: CompletionRateResult; oneOff: CompletionRateResult };
}

const toPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

const InsightsSummaryCards = ({ periodLabel, completionRate, dueAdherence, recurringVsOneOff }: InsightsSummaryCardsProps) => {
  const cards = [
    {
      label: `${periodLabel} 완료율`,
      value: toPercent(completionRate.rate),
      sub: `${completionRate.completed} / ${completionRate.total}`,
    },
    {
      label: `${periodLabel} 기한 준수율`,
      value: toPercent(dueAdherence.rate),
      sub: `${dueAdherence.completed} / ${dueAdherence.total}`,
    },
    {
      label: `${periodLabel} 반복 할 일 완료율`,
      value: toPercent(recurringVsOneOff.recurring.rate),
      sub: `${recurringVsOneOff.recurring.completed} / ${recurringVsOneOff.recurring.total}`,
    },
    {
      label: `${periodLabel} 일반 할 일 완료율`,
      value: toPercent(recurringVsOneOff.oneOff.rate),
      sub: `${recurringVsOneOff.oneOff.completed} / ${recurringVsOneOff.oneOff.total}`,
    },
  ];

  return (
    <Grid>
      {cards.map((card) => (
        <Card key={card.label}>
          <Label>{card.label}</Label>
          <Value>{card.value}</Value>
          <Sub>{card.sub}</Sub>
        </Card>
      ))}
    </Grid>
  );
};

export default InsightsSummaryCards;
export type { InsightsSummaryCardsProps };

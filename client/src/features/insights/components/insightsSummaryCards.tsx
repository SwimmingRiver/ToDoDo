import type { CompletionRateResult } from "../utils/computeCompletionRate";
import { Grid, Card, Label, Value, Sub } from "./insightsSummaryCards.styles";

interface InsightsSummaryCardsProps {
  completionRate7d: CompletionRateResult;
  completionRate30d: CompletionRateResult;
  dueAdherence: CompletionRateResult;
  recurringVsOneOff: { recurring: CompletionRateResult; oneOff: CompletionRateResult };
}

const toPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

const InsightsSummaryCards = ({
  completionRate7d,
  completionRate30d,
  dueAdherence,
  recurringVsOneOff,
}: InsightsSummaryCardsProps) => {
  const cards = [
    {
      label: "최근 7일 완료율",
      value: toPercent(completionRate7d.rate),
      sub: `${completionRate7d.completed} / ${completionRate7d.total}`,
    },
    {
      label: "최근 30일 완료율",
      value: toPercent(completionRate30d.rate),
      sub: `${completionRate30d.completed} / ${completionRate30d.total}`,
    },
    {
      label: "기한 준수율",
      value: toPercent(dueAdherence.rate),
      sub: `${dueAdherence.completed} / ${dueAdherence.total}`,
    },
    {
      label: "반복 할 일 완료율",
      value: toPercent(recurringVsOneOff.recurring.rate),
      sub: `${recurringVsOneOff.recurring.completed} / ${recurringVsOneOff.recurring.total}`,
    },
    {
      label: "일반 할 일 완료율",
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

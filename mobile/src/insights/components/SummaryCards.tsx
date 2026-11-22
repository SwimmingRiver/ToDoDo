import { StyleSheet, Text, View } from "react-native";
import type { CompletionRateResult } from "@tododo/core";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { cardStyles } from "./cardStyles";

interface SummaryCardsProps {
  /** "이번 달" 같은 기간 접두사. 카드 제목이 필터를 따라가게 한다. */
  periodLabel: string;
  completionRate: CompletionRateResult;
  dueAdherence: CompletionRateResult;
  recurringVsOneOff: { recurring: CompletionRateResult; oneOff: CompletionRateResult };
}

const toPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

export const SummaryCards = ({ periodLabel, completionRate, dueAdherence, recurringVsOneOff }: SummaryCardsProps) => {
  const cards = [
    { label: `${periodLabel} 완료율`, result: completionRate },
    { label: `${periodLabel} 기한 준수율`, result: dueAdherence },
    { label: `${periodLabel} 반복 할 일 완료율`, result: recurringVsOneOff.recurring },
    { label: `${periodLabel} 일반 할 일 완료율`, result: recurringVsOneOff.oneOff },
  ];

  return (
    <View style={styles.grid}>
      {cards.map(({ label, result }) => (
        <View key={label} style={[cardStyles.card, styles.card]}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{toPercent(result.rate)}</Text>
          <Text style={styles.sub}>{`${result.completed} / ${result.total}`}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { flexBasis: "47%", flexGrow: 1, gap: 4 },
  label: { fontSize: 12, fontWeight: "500", color: colors.text.secondary },
  value: { fontSize: 24, fontWeight: "700", color: colors.text.primary },
  sub: { fontSize: 12, color: colors.text.tertiary },
});

export type { SummaryCardsProps };

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { getStripDates, isSameLocalDay, toDateKey, type DayMarker } from "../../utils/dateRange";
import { colors } from "../../../theme/colors";
import { spacing, radius, MIN_TOUCH_TARGET } from "../../../theme/spacing";

const WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const MARKER_COLOR: Record<DayMarker, string | null> = {
  none: null,
  normal: colors.brand.fill,
  danger: colors.danger.main,
};

interface WeekStripProps {
  selectedDate: string;
  windowStart: string;
  markers: Record<string, DayMarker>;
  onSelectDate: (date: string) => void;
  onShiftLeft: () => void;
  onShiftRight: () => void;
  onGoToToday: () => void;
}

export const WeekStrip = ({
  selectedDate,
  windowStart,
  markers,
  onSelectDate,
  onShiftLeft,
  onShiftRight,
  onGoToToday,
}: WeekStripProps) => {
  const today = new Date();
  const stripDates = getStripDates(windowStart);
  const isTodayInStrip = stripDates.some((d) => isSameLocalDay(d, today));

  return (
    <View style={styles.container}>
      <Pressable onPress={onShiftLeft} accessibilityRole="button" accessibilityLabel="이전 날짜" hitSlop={13}>
        <ChevronLeft size={18} color={colors.text.secondary} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {stripDates.map((date) => {
          const dateKey = toDateKey(date);
          const isSelected = dateKey === selectedDate;
          const isToday = isSameLocalDay(date, today);
          const marker = markers[dateKey] ?? "none";
          const weekdayShort = WEEKDAY_SHORT_LABELS[date.getDay()];
          const weekdayFull = WEEKDAY_FULL_LABELS[date.getDay()];
          const dotColor = MARKER_COLOR[marker];

          return (
            <Pressable
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayFull}`}
              style={[styles.dayCell, isSelected && styles.dayCellSelected]}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{weekdayShort}</Text>
              <Text style={[styles.dateLabel, isSelected && styles.dateLabelSelected, isToday && styles.dateLabelToday]}>
                {date.getDate()}
              </Text>
              <View style={[styles.dot, dotColor ? { backgroundColor: dotColor } : styles.dotHidden]} />
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onShiftRight} accessibilityRole="button" accessibilityLabel="다음 날짜" hitSlop={13}>
        <ChevronRight size={18} color={colors.text.secondary} />
      </Pressable>
      {!isTodayInStrip && (
        <Pressable onPress={onGoToToday} accessibilityRole="button" accessibilityLabel="오늘로 이동" style={styles.todayChip}>
          <Text style={styles.todayChipText}>오늘</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  scroll: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  dayCell: {
    width: 40,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: 2,
  },
  dayCellSelected: {
    backgroundColor: colors.brand.strong,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  dayLabelSelected: {
    color: colors.background.primary,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  dateLabelToday: {
    color: colors.brand.strong,
  },
  dateLabelSelected: {
    color: colors.background.primary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotHidden: {
    backgroundColor: "transparent",
  },
  todayChip: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand.strong,
  },
});

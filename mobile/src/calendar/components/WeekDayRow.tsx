import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { parseLocalDateOnly } from "../../shared/utils/dateRange";
import { colors } from "../../theme/colors";
import { countVisibleChips } from "../visibleChipCount";
import type { WeekDayItem } from "../weekDayItems";

const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

interface WeekDayRowProps {
  dateKey: string;
  items: WeekDayItem[];
  isToday: boolean;
  isSelected: boolean;
  onPress: (dateKey: string) => void;
}

const buildAccessibilityLabel = (dateKey: string, items: WeekDayItem[]): string => {
  const date = parseLocalDateOnly(dateKey);
  const head = `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_FULL[date.getDay()]}`;
  const todoCount = items.filter((item) => item.kind === "todo").length;
  const googleCount = items.length - todoCount;
  const parts = [
    todoCount > 0 ? `할 일 ${todoCount}개` : null,
    googleCount > 0 ? `구글 일정 ${googleCount}개` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${head}, ${parts.join(", ")}` : `${head}, 일정 없음`;
};

const Chip = ({ item, testID, onLayout }: { item: WeekDayItem; testID: string; onLayout?: (e: LayoutChangeEvent) => void }) => (
  <View testID={testID} style={styles.chip} onLayout={onLayout}>
    <View style={[styles.dot, { backgroundColor: item.dotColor }]} />
    <Text style={[styles.chipText, item.muted && styles.chipTextMuted]} numberOfLines={1}>
      {item.title}
    </Text>
  </View>
);

/**
 * 주간 보기의 하루 줄. 왼쪽에 요일·날짜, 오른쪽에 제목 칩이 가로로 흘러 감긴다.
 * 줄 높이를 넘는 칩은 그리지 않고 남은 개수를 `+n`으로 보인다.
 *
 * 몇 개가 들어가는지는 글자 폭을 어림하지 않고 실제 배치를 잰다. 보이는 칩만 재면 숨긴 칩은
 * 다시 잴 수 없고, RN은 위치가 그대로인 칩에 onLayout을 다시 쏘지 않아 항목이 바뀔 때 측정이
 * 끝나지 않는다. 그래서 같은 폭의 보이지 않는 측정 층에 칩을 항상 전부 그려 두고, 칩 key별로
 * 아래 끝(y + height)을 기억한다.
 * 줄 아무 데나 누르면 그 날짜를 넘긴다(화면이 날짜 시트를 연다).
 */
export const WeekDayRow = ({ dateKey, items, isToday, isSelected, onPress }: WeekDayRowProps) => {
  const date = parseLocalDateOnly(dateKey);
  const [chipBottoms, setChipBottoms] = useState<Record<string, number>>({});
  const [containerHeight, setContainerHeight] = useState<number | null>(null);

  const visibleCount = useMemo(() => {
    const bottoms = items.map((item) => chipBottoms[item.key]);
    if (containerHeight === null || bottoms.some((bottom) => bottom === undefined)) return items.length;
    return countVisibleChips(bottoms as number[], containerHeight);
  }, [chipBottoms, containerHeight, items]);
  const hiddenCount = items.length - visibleCount;

  const handleMeasure = (key: string) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setChipBottoms((prev) => (prev[key] === y + height ? prev : { ...prev, [key]: y + height }));
  };

  return (
    <Pressable
      testID={`week-row-${dateKey}`}
      onPress={() => onPress(dateKey)}
      accessibilityRole="button"
      accessibilityLabel={buildAccessibilityLabel(dateKey, items)}
      accessibilityState={{ selected: isSelected }}
      style={styles.row}
    >
      <View style={styles.dateColumn}>
        <Text style={[styles.weekday, isToday && styles.today]}>{WEEKDAY_SHORT[date.getDay()]}</Text>
        <View style={[styles.circle, isSelected && styles.circleSelected]}>
          <Text style={[styles.day, isToday && styles.today, isSelected && styles.daySelected]}>{date.getDate()}</Text>
        </View>
      </View>
      <View
        testID={`week-chips-${dateKey}`}
        style={styles.chips}
        onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
      >
        <View style={[styles.wrap, styles.measureLayer]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {items.map((item) => (
            <Chip key={item.key} item={item} testID={`week-measure-${item.key}`} onLayout={handleMeasure(item.key)} />
          ))}
        </View>
        <View style={styles.wrap}>
          {items.slice(0, visibleCount).map((item) => (
            <Chip key={item.key} item={item} testID={`week-chip-${item.key}`} />
          ))}
          {hiddenCount > 0 && (
            <Text testID={`week-more-${dateKey}`} style={styles.more}>
              {`+${hiddenCount}`}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.tertiary,
    paddingVertical: 6,
    paddingRight: 8,
  },
  dateColumn: {
    width: 48,
    alignItems: "center",
    gap: 2,
  },
  weekday: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  circleSelected: {
    backgroundColor: colors.brand.strong,
  },
  day: {
    fontSize: 15,
    color: colors.text.primary,
  },
  daySelected: {
    color: colors.background.primary,
  },
  today: {
    color: colors.brand.strong,
    fontWeight: "700",
  },
  chips: {
    flex: 1,
    overflow: "hidden",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    gap: 4,
  },
  // 보이는 층과 같은 폭에 겹쳐 두고 투명하게 — 칩 배치만 잰다.
  measureLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.background.secondary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  chipTextMuted: {
    color: colors.text.tertiary,
  },
  more: {
    fontSize: 12,
    color: colors.text.secondary,
    alignSelf: "center",
    paddingHorizontal: 4,
  },
});

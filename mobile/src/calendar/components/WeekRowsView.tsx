import { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { swipeDirection } from "../swipe";
import { getWeekDateKeys } from "../weekRange";
import type { WeekDayItem } from "../weekDayItems";
import { WeekDayRow } from "./WeekDayRow";

interface WeekRowsViewProps {
  weekStartKey: string;
  itemsByDate: Record<string, WeekDayItem[]>;
  todayKey: string;
  selectedDate: string | null;
  onPressDate: (dateKey: string) => void;
  onSwipeWeek: (delta: -1 | 1) => void;
}

const EMPTY: WeekDayItem[] = [];

/**
 * 주간 보기 본문: 일~토 7줄이 남은 높이를 균등하게 채운다. 가로로 밀면 주를 넘긴다
 * (RN 내장 PanResponder — 짧거나 세로가 더 큰 움직임은 가로채지 않아 줄 탭은 그대로 동작).
 */
export const WeekRowsView = ({
  weekStartKey,
  itemsByDate,
  todayKey,
  selectedDate,
  onPressDate,
  onSwipeWeek,
}: WeekRowsViewProps) => {
  const dateKeys = useMemo(() => getWeekDateKeys(weekStartKey), [weekStartKey]);
  // PanResponder는 한 번만 만들므로 최신 콜백은 ref로 읽는다.
  const onSwipeRef = useRef(onSwipeWeek);
  onSwipeRef.current = onSwipeWeek;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => swipeDirection(gesture.dx, gesture.dy) !== 0,
        onPanResponderRelease: (_, gesture) => {
          const direction = swipeDirection(gesture.dx, gesture.dy);
          if (direction !== 0) onSwipeRef.current(direction);
        },
      }),
    [],
  );

  return (
    <View style={styles.body} {...panResponder.panHandlers}>
      {dateKeys.map((dateKey) => (
        <WeekDayRow
          key={dateKey}
          dateKey={dateKey}
          items={itemsByDate[dateKey] ?? EMPTY}
          isToday={dateKey === todayKey}
          isSelected={dateKey === selectedDate}
          onPress={onPressDate}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1 },
});

import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CalendarProps, DateData } from "react-native-calendars";
import { colors } from "../../../theme/colors";

// 라이브러리가 DayProps/DayState 타입을 루트에서 export하지 않아 dayComponent의 props로 유도한다.
// date는 DayProps(string)와 dayComponent 전용(DateData)이 교차돼 있어, 실제로 넘어오는 DateData로 좁힌다.
type CalendarDayCellProps = Omit<ComponentProps<NonNullable<CalendarProps["dayComponent"]>>, "date"> & {
  date?: DateData;
};

/**
 * react-native-calendars의 dayComponent. 캘린더를 화면 높이에 맞춰 늘리면 기본
 * BasicDay는 32px 원만 눌리므로, 칸 전체를 눌림 영역으로 쓰고 숫자·점은 위쪽에 둔다.
 */
export const CalendarDayCell = ({ date, state, marking, onPress, accessibilityLabel }: CalendarDayCellProps) => {
  if (!date) return null;
  const isSelected = marking?.selected === true;
  const isToday = state === "today";
  const isDisabled = state === "disabled";

  return (
    <Pressable
      testID={`calendar-day-${date.dateString}`}
      onPress={() => onPress?.(date)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected }}
      style={styles.cell}
    >
      <View
        testID={`calendar-day-circle-${date.dateString}`}
        style={[styles.circle, isSelected && styles.circleSelected]}
      >
        {/* 오늘 → 선택 순서: 선택이 뒤에 와야 오늘이면서 선택된 날도 흰 글자가 된다. */}
        <Text
          style={[
            styles.label,
            isDisabled && styles.labelDisabled,
            isToday && styles.labelToday,
            isSelected && styles.labelSelected,
          ]}
        >
          {date.day}
        </Text>
      </View>
      <View style={styles.dots}>
        {marking?.dots?.map((dot, index) => (
          <View
            key={dot.key ?? index}
            testID={`calendar-dot-${date.dateString}-${dot.key}`}
            style={[styles.dot, { backgroundColor: dot.color }]}
          />
        ))}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    gap: 4,
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
  label: {
    fontSize: 14,
    color: colors.text.primary,
  },
  labelDisabled: {
    color: colors.text.tertiary,
  },
  labelToday: {
    color: colors.brand.strong,
    fontWeight: "700",
  },
  labelSelected: {
    color: colors.background.primary,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});

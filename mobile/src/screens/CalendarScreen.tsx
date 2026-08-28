import { useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Calendar, LocaleConfig, type DateData } from "react-native-calendars";
import { AlertCircle } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { CalendarStackParamList } from "../navigation/types";
import { useCalendarTodos } from "../hooks/useCalendarTodos";
import { DateTodosSheet } from "../shared/ui/dateTodosSheet/DateTodosSheet";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { formatTodayLabel } from "../shared/utils/formatToday";
import { parseLocalDateOnly } from "../shared/utils/dateRange";
import type { CalendarMarkedDates } from "../shared/utils/calendarMarkers";
import { colors } from "../theme/colors";

// react-native-calendars는 LocaleConfig 등록이 없으면 XDate의 영어 로케일로
// 월/요일명을 그린다 — 앱 전체가 한국어이므로 모듈 로드 시 한 번 등록한다.
LocaleConfig.locales.ko = {
  monthNames: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  monthNamesShort: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  dayNames: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
  dayNamesShort: ["일", "월", "화", "수", "목", "금", "토"],
  today: "오늘",
};
LocaleConfig.defaultLocale = "ko";

const CALENDAR_THEME = {
  todayTextColor: colors.brand.strong,
  selectedDayBackgroundColor: colors.brand.strong,
  selectedDayTextColor: colors.background.primary,
  arrowColor: colors.brand.strong,
  monthTextColor: colors.text.primary,
  textSectionTitleColor: colors.text.secondary,
} as const;

/** selectedDate 항목에 선택 표시(selected)를 덧붙인다 — 기존 markedDates는 불변으로 둔다. */
function withSelection(markedDates: CalendarMarkedDates, selectedDate: string | null): CalendarMarkedDates {
  if (!selectedDate) return markedDates;
  const existing = markedDates[selectedDate] ?? { dots: [] };
  return { ...markedDates, [selectedDate]: { ...existing, selected: true } };
}

export const CalendarScreen = () => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { markedDates, isLoading, isError, getTodosForDate, toggleDone } = useCalendarTodos();
  const markedDatesWithSelection = useMemo(
    () => withSelection(markedDates, selectedDate),
    [markedDates, selectedDate],
  );

  const handleDayPress = (day: DateData) => {
    // day.dateString은 react-native-calendars가 이미 로컬 캘린더 날짜 기준
    // "yyyy-MM-dd"로 준다 — 우리 쪽 toDateKey/toDateKeyFromISO 변환을 다시 거치면
    // 이중 변환이 되므로 그대로 dateKey로 쓴다.
    setSelectedDate(day.dateString);
    setIsSheetOpen(true);
  };

  const handleAddTodo = () => {
    if (!selectedDate) return;
    setIsSheetOpen(false);
    navigation.navigate("TodoForm", { dueAt: parseLocalDateOnly(selectedDate).toISOString() });
  };

  const handlePressTodo = (todo: Todo) => {
    setIsSheetOpen(false);
    navigation.navigate("TodoDetail", { id: todo.id });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <Calendar
        markingType="multi-dot"
        markedDates={markedDatesWithSelection}
        onDayPress={handleDayPress}
        theme={CALENDAR_THEME}
      />
      <DateTodosSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        dateLabel={selectedDate ? formatTodayLabel(selectedDate) : ""}
        selectedDate={selectedDate ?? ""}
        todos={selectedDate ? getTodosForDate(selectedDate) : []}
        onToggleDone={toggleDone}
        onPressTodo={handlePressTodo}
        onAddTodo={handleAddTodo}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
});

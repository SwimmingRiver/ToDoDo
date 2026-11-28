import { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Calendar, LocaleConfig, type CalendarProps, type DateData } from "react-native-calendars";
import { AlertCircle } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import {
  filterUnsyncedEvents,
  getGoogleEventDateKeys,
  isDateInGoogleEventRange,
} from "@tododo/core/dist/calendarSync/index.js";
import type { CalendarStackParamList } from "../navigation/types";
import { useCalendarTodos } from "../hooks/useCalendarTodos";
import { useGoogleCalendarEvents } from "../calendarIntegration/useGoogleCalendarEvents";
import { CalendarConnectionBar } from "../calendarIntegration/components/CalendarConnectionBar";
import { CalendarDayCell } from "../shared/ui/calendarDayCell/CalendarDayCell";
import { DateTodosSheet } from "../shared/ui/dateTodosSheet/DateTodosSheet";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { formatTodayLabel } from "../shared/utils/formatToday";
import { parseLocalDateOnly, toDateKey } from "../shared/utils/dateRange";
import { addGoogleEventDots, type CalendarMarkedDates } from "../shared/utils/calendarMarkers";
import { colors } from "../theme/colors";
import {
  formatWeekLabel,
  getWeekDateKeys,
  getWeekStartKey,
  monthForWeekToMonth,
  monthsForWeek,
  shiftWeekKey,
  weekStartForMonthToWeek,
  type VisibleMonth,
} from "../calendar/weekRange";
import { buildWeekDayItems, type WeekDayItem } from "../calendar/weekDayItems";
import { ViewModeToggle, type CalendarViewMode } from "../calendar/components/ViewModeToggle";
import { WeekHeader } from "../calendar/components/WeekHeader";
import { WeekRowsView } from "../calendar/components/WeekRowsView";

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
  // 화면 높이를 꽉 채우도록 주(week) 행을 늘린다. 라이브러리는 이 키를 런타임에
  // theme["stylesheet.calendar.main"]으로 읽지만 Theme 타입에는 없어 아래에서 단언한다.
  "stylesheet.calendar.main": {
    monthView: { flex: 1 },
    week: {
      flex: 1,
      marginVertical: 0,
      flexDirection: "row",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border.tertiary,
    },
    dayContainer: { flex: 1 },
  },
} as CalendarProps["theme"];

/** selectedDate 항목에 선택 표시(selected)를 덧붙인다 — 기존 markedDates는 불변으로 둔다. */
function withSelection(markedDates: CalendarMarkedDates, selectedDate: string | null): CalendarMarkedDates {
  if (!selectedDate) return markedDates;
  const existing = markedDates[selectedDate] ?? { dots: [] };
  return { ...markedDates, [selectedDate]: { ...existing, selected: true } };
}

const currentWeekStart = (): string => getWeekStartKey(toDateKey(new Date()));

const currentMonth = (): VisibleMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

/** 보이는 달의 1일 로컬 0시 ~ 다음 달 1일 로컬 0시(end 배타). 앞뒤 달 회색 날짜는 범위 밖이라
 *  구글 점이 찍히지 않는다. */
const toMonthRange = ({ year, month }: VisibleMonth) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    // Calendar initialDate로도 넘긴다 — 오류 화면 등으로 달력이 언마운트됐다 다시 올라와도
    // 오늘 달로 돌아가지 않고 사용자가 보던 달(= 조회 범위)과 계속 맞물리게 한다.
    startKey: toDateKey(start),
    endKeyExclusive: toDateKey(end),
  };
};

export const CalendarScreen = () => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Calendar의 바깥 래퍼는 style을 받지 않아 flex로 늘릴 수 없다 — 남은 높이를 재서
  // 안쪽 컨테이너에 고정 높이로 넘긴다.
  const [calendarHeight, setCalendarHeight] = useState<number | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { todos, markedDates, isLoading, isError, getTodosForDate } = useCalendarTodos();
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(currentMonth);
  // 앱(화면)을 새로 띄우면 월간으로 시작한다 — 마지막 선택은 저장하지 않는다(스펙 4-1).
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [weekStartKey, setWeekStartKey] = useState<string>(currentWeekStart);
  const monthRange = useMemo(() => toMonthRange(visibleMonth), [visibleMonth]);
  // 구글 일정은 주간에서도 월간과 같은 달 단위로 조회한다 — 같은 쿼리 캐시를 써서 주를 넘길 때마다
  // calendar-proxy를 다시 부르지 않는다. 두 달에 걸친 주는 두 달을 조회해 합친다(월간이면 둘째는 null).
  const queryRanges = useMemo(() => {
    if (mode !== "week") return [monthRange.range, null] as const;
    const [first, second] = monthsForWeek(weekStartKey);
    return [toMonthRange(first).range, second ? toMonthRange(second).range : null] as const;
  }, [mode, weekStartKey, monthRange]);
  // 조회 실패는 화면 오류로 만들지 않는다 — data가 없으면 점·줄만 빠진다.
  const { data: primaryEvents } = useGoogleCalendarEvents(queryRanges[0]);
  const { data: secondaryEvents } = useGoogleCalendarEvents(queryRanges[1]);
  // 두 달에 걸친 일정은 양쪽 조회에 다 나오므로 id로 한 번만 남긴다.
  const googleEvents = useMemo(() => {
    if (!secondaryEvents) return primaryEvents;
    const seen = new Set((primaryEvents ?? []).map((event) => event.id));
    return [...(primaryEvents ?? []), ...secondaryEvents.filter((event) => !seen.has(event.id))];
  }, [primaryEvents, secondaryEvents]);
  // ToDoDo가 만든(googleEventId로 링크된) 이벤트는 같은 할 일이 두 번 보이지 않게 뺀다.
  const overlayEvents = useMemo(() => filterUnsyncedEvents(googleEvents ?? [], todos), [googleEvents, todos]);
  const markedDatesWithSelection = useMemo(() => {
    const eventDateKeys = overlayEvents.flatMap((event) =>
      getGoogleEventDateKeys(event, monthRange.startKey, monthRange.endKeyExclusive),
    );
    return withSelection(addGoogleEventDots(markedDates, eventDateKeys), selectedDate);
  }, [markedDates, overlayEvents, monthRange, selectedDate]);
  // 주간 하루 줄 칩. 그날의 할 일은 날짜 시트와 같은 getTodosForDate(기간 할 일은 기간 내 매일),
  // 구글 일정은 시트와 같은 isDateInGoogleEventRange로 거른다. WeekDayRow가 items 배열 기준으로
  // 칩을 재므로 매 렌더 새 배열이 되지 않게 메모한다.
  const itemsByDate = useMemo(() => {
    if (mode !== "week") return {};
    const result: Record<string, WeekDayItem[]> = {};
    for (const dateKey of getWeekDateKeys(weekStartKey)) {
      result[dateKey] = buildWeekDayItems(
        dateKey,
        getTodosForDate(dateKey),
        overlayEvents.filter((event) => isDateInGoogleEventRange(dateKey, event)),
      );
    }
    return result;
  }, [mode, weekStartKey, getTodosForDate, overlayEvents]);
  const selectedDateGoogleEvents = useMemo(
    () => (selectedDate ? overlayEvents.filter((event) => isDateInGoogleEventRange(selectedDate, event)) : []),
    [overlayEvents, selectedDate],
  );

  const handleMonthChange = (month: DateData) => {
    // 라이브러리는 initialDate 반영·마운트 때도 같은 달로 onMonthChange를 쏜다 — 같은 달이면
    // 이전 상태를 그대로 둬서 불필요한 재렌더·재계산이 없게 한다(initialDate 문자열도 그대로라 루프 없음).
    setVisibleMonth((prev) =>
      prev.year === month.year && prev.month === month.month ? prev : { year: month.year, month: month.month },
    );
  };

  const openDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setIsSheetOpen(true);
  };

  // day.dateString은 react-native-calendars가 이미 로컬 캘린더 날짜 기준 "yyyy-MM-dd"로 준다 —
  // 우리 쪽 toDateKey/toDateKeyFromISO 변환을 다시 거치면 이중 변환이 되므로 그대로 dateKey로 쓴다.
  const handleDayPress = (day: DateData) => openDate(day.dateString);

  const handleModeChange = (next: CalendarViewMode) => {
    if (next === mode) return;
    const today = new Date();
    if (next === "week") {
      setWeekStartKey(weekStartForMonthToWeek({ selectedDate, visibleMonth, today }));
    } else {
      // Calendar initialDate가 monthRange.startKey라 이 달로 다시 그려진다.
      setVisibleMonth(monthForWeekToMonth(weekStartKey, today));
    }
    setMode(next);
  };

  const shiftWeek = (delta: number) => setWeekStartKey((prev) => shiftWeekKey(prev, delta));

  const handleAddTodo = () => {
    if (!selectedDate) return;
    setIsSheetOpen(false);
    navigation.navigate("TodoForm", { dueAt: parseLocalDateOnly(selectedDate).toISOString() });
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setCalendarHeight(event.nativeEvent.layout.height);
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
      {/* calendarArea 밖에 둬야 onLayout이 연결 줄을 뺀 남은 높이를 잰다. */}
      <CalendarConnectionBar todos={todos} />
      <ViewModeToggle mode={mode} onChange={handleModeChange} />
      {mode === "week" ? (
        <>
          <WeekHeader
            label={formatWeekLabel(weekStartKey, new Date())}
            onPrev={() => shiftWeek(-1)}
            onNext={() => shiftWeek(1)}
            onToday={() => setWeekStartKey(currentWeekStart())}
          />
          <WeekRowsView
            weekStartKey={weekStartKey}
            itemsByDate={itemsByDate}
            todayKey={toDateKey(new Date())}
            selectedDate={selectedDate}
            onPressDate={openDate}
            onSwipeWeek={shiftWeek}
          />
        </>
      ) : (
        <View style={styles.calendarArea} onLayout={handleLayout}>
          <Calendar
            initialDate={monthRange.startKey}
            markingType="multi-dot"
            markedDates={markedDatesWithSelection}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            dayComponent={CalendarDayCell}
            theme={CALENDAR_THEME}
            style={calendarHeight != null ? { height: calendarHeight } : undefined}
          />
        </View>
      )}
      <DateTodosSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        dateLabel={selectedDate ? formatTodayLabel(selectedDate) : ""}
        dateKey={selectedDate}
        todos={selectedDate ? getTodosForDate(selectedDate) : []}
        googleEvents={selectedDateGoogleEvents}
        onPressTodo={handlePressTodo}
        onAddTodo={handleAddTodo}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  calendarArea: {
    flex: 1,
  },
});

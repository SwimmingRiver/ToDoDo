import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Sun, Plus, AlertCircle } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { TodayStackParamList } from "../navigation/types";
import { useTodayTodos } from "../hooks/useTodayTodos";
import { WeekStrip } from "../shared/ui/weekStrip/WeekStrip";
import { DailyProgress } from "../shared/ui/dailyProgress/DailyProgress";
import { TodayTodoItem } from "../shared/ui/todayTodoItem/TodayTodoItem";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { formatTodayLabel } from "../shared/utils/formatToday";
import { toDateKey, parseLocalDateOnly } from "../shared/utils/dateRange";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const TodayScreen = () => {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [windowStart, setWindowStart] = useState(() => toDateKey(new Date()));
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const shiftWindow = (days: number) => {
    setWindowStart((prev) => {
      const d = parseLocalDateOnly(prev);
      d.setDate(d.getDate() + days);
      return toDateKey(d);
    });
  };

  const handleGoToToday = () => {
    const today = toDateKey(new Date());
    setWindowStart(today);
    setSelectedDate(today);
  };

  const { inProgressTodos, doneTodos, doneCount, totalCount, markers, isLoading, isError, toggleDone } =
    useTodayTodos(selectedDate, windowStart);

  const handleOpenDetail = (todo: Todo) => navigation.navigate("TodoDetail", { id: todo.id });
  const handleAdd = () => {
    // parseLocalDateOnly는 이미 로컬 자정(00:00:00) Date를 반환하므로 그대로 UTC ISO로 변환한다.
    navigation.navigate("TodoForm", { dueAt: parseLocalDateOnly(selectedDate).toISOString() });
  };

  const hasTodos = inProgressTodos.length > 0 || doneTodos.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <WeekStrip
        selectedDate={selectedDate}
        windowStart={windowStart}
        markers={markers}
        onSelectDate={setSelectedDate}
        onShiftLeft={() => shiftWindow(-7)}
        onShiftRight={() => shiftWindow(7)}
        onGoToToday={handleGoToToday}
      />
      <DailyProgress dateLabel={formatTodayLabel(selectedDate)} doneCount={doneCount} totalCount={totalCount} />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      ) : !hasTodos ? (
        <EmptyState
          icon={Sun}
          title="오늘 할 일이 없습니다"
          description="여유로운 하루네요. 새로운 할 일을 추가해보세요"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {inProgressTodos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>진행 중</Text>
              <View style={styles.list}>
                {inProgressTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    selectedDate={selectedDate}
                    onToggleDone={toggleDone}
                    onPress={handleOpenDetail}
                  />
                ))}
              </View>
            </View>
          )}
          {doneTodos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>완료</Text>
              <View style={styles.list}>
                {doneTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    selectedDate={selectedDate}
                    onToggleDone={toggleDone}
                    onPress={handleOpenDetail}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <Pressable
        onPress={handleAdd}
        accessibilityRole="button"
        accessibilityLabel="할 일 추가"
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Plus size={16} color={colors.background.primary} />
        <Text style={styles.addButtonText}>할 일 추가</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  list: {
    gap: spacing.sm,
  },
  addButton: {
    minHeight: 48,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand.strong,
    borderRadius: 10,
  },
  addButtonPressed: {
    backgroundColor: colors.brand.strongHover,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.background.primary,
  },
});

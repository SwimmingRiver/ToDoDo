import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { Checkbox } from "../checkbox/Checkbox";
import { PeriodBadge } from "../periodBadge/PeriodBadge";
import { Card } from "../card/Card";
import { DueBadge } from "../dueBadge/DueBadge";
import { getDaysLeft, getDueBadgeLabel, getUrgency } from "../../utils/due";
import { getPeriodProgress } from "../../utils/dateRange";
import { formatDueTime } from "../../utils/formatToday";
import { statusColors } from "../../../theme/statusColors";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface TodayTodoItemProps {
  todo: Todo;
  /** 진행 일차 배지 계산 기준 날짜(로컬 yyyy-MM-dd). */
  selectedDate: string;
  onToggleDone: (todo: Todo) => void;
  onPress: (todo: Todo) => void;
}

/**
 * 웹 todayTodoItem.tsx 대응. 반복 배지·링크 표시·삭제 버튼은 이번 스코프에서
 * 제외한다(2026-08-27 스펙 결정).
 */
export const TodayTodoItem = ({ todo, selectedDate, onToggleDone, onPress }: TodayTodoItemProps) => {
  const isDone = todo.status === "done";
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const urgency = daysLeft !== null ? getUrgency(daysLeft) : "normal";
  const periodProgress = !isDone ? getPeriodProgress(selectedDate, todo) : null;
  const isLastDayOfPeriod = periodProgress ? periodProgress.dayIndex === periodProgress.totalDays : true;
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;

  return (
    <Card borderColor={statusColors[todo.status].border} testID={`today-item-${todo.id}`}>
      <View style={styles.row}>
        <Checkbox
          checked={isDone}
          onPress={() => onToggleDone(todo)}
          accessibilityLabel={`${todo.title} 완료 처리`}
        />
        <Pressable style={styles.content} onPress={() => onPress(todo)}>
          <View style={styles.titleRow}>
            {periodProgress && (
              <PeriodBadge dayIndex={periodProgress.dayIndex} totalDays={periodProgress.totalDays} />
            )}
            <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
              {todo.title}
            </Text>
          </View>
        </Pressable>
        {!isDone && daysLeft !== null && urgency !== "normal" && <DueBadge daysLeft={daysLeft} />}
        {!isDone && urgency === "normal" && (
          <>
            {isLastDayOfPeriod
              ? dueTime && <Text style={styles.timeLabel}>{dueTime}</Text>
              : daysLeft !== null && <Text style={styles.timeLabel}>{getDueBadgeLabel(daysLeft)}</Text>}
          </>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  titleDone: {
    color: colors.text.tertiary,
    textDecorationLine: "line-through",
  },
  timeLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});

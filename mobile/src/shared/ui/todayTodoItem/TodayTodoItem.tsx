import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { Checkbox } from "../checkbox/Checkbox";
import { PeriodBadge } from "../periodBadge/PeriodBadge";
import { DueBadge } from "../dueBadge/DueBadge";
import { RecurrenceBadge } from "../recurrenceBadge/RecurrenceBadge";
import { getDaysLeft, getDueBadgeLabel, getUrgency } from "../../utils/due";
import { getPeriodProgress } from "../../utils/dateRange";
import { formatDueTime } from "../../utils/formatToday";
import { colors } from "../../../theme/colors";
import { urgencyColors } from "../../../theme/urgencyColors";

interface TodayTodoItemProps {
  todo: Todo;
  /** 진행 일차 배지 계산 기준 날짜(로컬 yyyy-MM-dd). */
  selectedDate: string;
  onToggleDone: (todo: Todo) => void;
  onPress: (todo: Todo) => void;
  /** 목록의 마지막 행이면 하단 구분선을 숨긴다(웹 `&:last-child { border-bottom: none }`). */
  isLast?: boolean;
}

/**
 * 웹 todayTodoItem.tsx 대응 — 카드 없이 하단 구분선으로 나뉜 행. 링크 포함 표시와 삭제
 * 버튼은 제외한다(앱에 링크 감지·열기 기능이 아직 없고, 삭제는 상세 화면에서 한다).
 */
export const TodayTodoItem = ({ todo, selectedDate, onToggleDone, onPress, isLast = false }: TodayTodoItemProps) => {
  const isDone = todo.status === "done";
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const urgency = daysLeft !== null ? getUrgency(daysLeft) : "normal";
  const periodProgress = !isDone ? getPeriodProgress(selectedDate, todo) : null;
  // 기간 항목의 마지막 날(=마감일 당일)에는 시각(dueTime)을, 그 이전 진행 중인 날에는
  // "며칠 남았는지"를 보여준다. 단일 마감일 항목(periodProgress === null)은 항상 마지막 날 취급.
  const isLastDayOfPeriod = periodProgress ? periodProgress.dayIndex === periodProgress.totalDays : true;
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;
  const ringColor =
    !isDone && urgency === "danger"
      ? colors.border.danger
      : !isDone && urgency === "soon"
        ? urgencyColors.soon.main
        : colors.border.secondary;

  return (
    <View testID={`today-item-${todo.id}`} style={[styles.row, isLast && styles.rowLast]}>
      <Checkbox
        checked={isDone}
        onPress={() => onToggleDone(todo)}
        accessibilityLabel={`${todo.title} 완료 처리`}
        ringColor={ringColor}
      />
      <Pressable style={styles.content} onPress={() => onPress(todo)}>
        <View style={styles.titleRow}>
          {periodProgress && (
            <PeriodBadge dayIndex={periodProgress.dayIndex} totalDays={periodProgress.totalDays} />
          )}
          <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
            {todo.title}
          </Text>
          {todo.recurrenceId != null && <RecurrenceBadge compact />}
        </View>
        {!!todo.description && (
          <Text style={styles.description} numberOfLines={2}>
            {todo.description}
          </Text>
        )}
      </Pressable>
      {!isDone && daysLeft !== null && urgency !== "normal" && (
        <DueBadge daysLeft={daysLeft} urgency={urgency} testID={`due-badge-${todo.id}`} />
      )}
      {!isDone && urgency === "normal" && (
        <>
          {isLastDayOfPeriod
            ? dueTime && <Text style={styles.timeLabel}>{dueTime}</Text>
            : daysLeft !== null && <Text style={styles.timeLabel}>{getDueBadgeLabel(daysLeft)}</Text>}
        </>
      )}
    </View>
  );
};

// 웹 todayTodoItem.styles.tsx: Row gap 12, min-height 44, padding 12px 0, 하단 1px 구분선.
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.tertiary,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  titleDone: {
    color: colors.text.tertiary,
    textDecorationLine: "line-through",
  },
  description: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  timeLabel: {
    flexShrink: 0,
    fontSize: 12,
    color: colors.text.secondary,
  },
});

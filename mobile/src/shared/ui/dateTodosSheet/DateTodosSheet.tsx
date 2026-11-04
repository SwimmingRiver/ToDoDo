import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import { EmptyState } from "../emptyState/EmptyState";
import { Button } from "../button/Button";
import { RecurrenceBadge } from "../recurrenceBadge/RecurrenceBadge";
import { isTodoOverdue } from "../../utils/due";
import { formatRecurrenceSummary } from "../../utils/recurrenceSummary";
import { colors } from "../../../theme/colors";
import { statusColors, type Status } from "../../../theme/statusColors";
import { spacing } from "../../../theme/spacing";

const STATUS_LABEL: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

/** 웹 캘린더 시트의 toLocaleDateString("ko-KR", { month: "short", day: "numeric" })와 같은 "6월 20일". */
const formatMonthDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

interface DateTodosSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** formatTodayLabel(selectedDate) 결과, 예: "6월 20일, 토요일". */
  dateLabel: string;
  todos: Todo[];
  onPressTodo: (todo: Todo) => void;
  onAddTodo: () => void;
}

/**
 * 캘린더에서 날짜를 탭했을 때 여는 시트. 기존 shared/ui/bottomSheet/BottomSheet는
 * 옵션 단일 선택 전용(상태 변경 시트)이라 할 일 목록+추가 버튼을 담을 수 없어,
 * 같은 Modal+slide+overlay+handle 시각 언어로 새로 만든다(계획 문서 1절 참고).
 * 항목 유무와 무관하게 항상 열리고(스펙 8절 결정 1), 빈 상태에도 추가 버튼을 둔다.
 *
 * 항목은 웹 캘린더 시트(DayDetailItem)처럼 체크박스 없는 정보형으로 보여준다 — 상태·시작·마감과
 * 반복 요약을 훑어보는 용도. 웹과 달리 항목 전체를 눌러 상세 화면으로 갈 수 있다.
 */
export const DateTodosSheet = ({
  isOpen,
  onClose,
  dateLabel,
  todos,
  onPressTodo,
  onAddTodo,
}: DateTodosSheetProps) => {
  const hasTodos = todos.length > 0;

  return (
    <Modal transparent animationType="slide" visible={isOpen} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="닫기">
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{dateLabel}</Text>
          </View>

          {hasTodos ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {todos.map((todo) => (
                <DateTodoItem key={todo.id} todo={todo} onPress={onPressTodo} />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <EmptyState
                icon={CalendarDays}
                title="이 날짜엔 할 일이 없어요"
                description="새로운 할 일을 추가해보세요"
              />
            </View>
          )}

          <View style={styles.footer}>
            <Button title="할 일 추가" onPress={onAddTodo} variant="primary" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const DateTodoItem = ({ todo, onPress }: { todo: Todo; onPress: (todo: Todo) => void }) => {
  const isOverdue = isTodoOverdue(todo);
  const meta = [
    STATUS_LABEL[todo.status],
    todo.startAt && `시작: ${formatMonthDay(todo.startAt)}`,
    todo.dueAt && `마감: ${formatMonthDay(todo.dueAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      testID={`date-todo-${todo.id}`}
      onPress={() => onPress(todo)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.item,
        {
          borderLeftColor: isOverdue ? colors.danger.main : statusColors[todo.status].main,
          backgroundColor: isOverdue ? colors.danger.background : colors.background.primary,
        },
        pressed && styles.itemPressed,
      ]}
    >
      <View style={styles.itemTitleRow}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {todo.title}
        </Text>
        {todo.recurrenceId != null && <RecurrenceBadge />}
      </View>
      <Text style={styles.itemMeta}>{meta}</Text>
      {todo.recurrenceId != null && todo.recurrence && (
        <Text style={styles.itemRecurrence}>{formatRecurrenceSummary(todo.recurrence, todo.dueAt)}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.tertiary,
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  list: {
    maxHeight: 360,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  // 웹 DayDetailItem: padding 12px 16px, 좌측 4px 보더, 오른쪽만 둥근 모서리 8px.
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.secondary,
  },
  itemRecurrence: {
    marginTop: 2,
    fontSize: 11,
    color: colors.brand.strong,
  },
  empty: {
    minHeight: 240,
  },
  footer: {
    padding: spacing.lg,
  },
});

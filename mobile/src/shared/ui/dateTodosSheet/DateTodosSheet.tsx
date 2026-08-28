import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import { TodayTodoItem } from "../todayTodoItem/TodayTodoItem";
import { EmptyState } from "../emptyState/EmptyState";
import { Button } from "../button/Button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface DateTodosSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** formatTodayLabel(selectedDate) 결과, 예: "6월 20일, 토요일". */
  dateLabel: string;
  /** 로컬 "yyyy-MM-dd". TodayTodoItem의 진행 일차 배지 계산 기준으로 그대로 전달한다. */
  selectedDate: string;
  todos: Todo[];
  onToggleDone: (todo: Todo) => void;
  onPressTodo: (todo: Todo) => void;
  onAddTodo: () => void;
}

/**
 * 캘린더에서 날짜를 탭했을 때 여는 시트. 기존 shared/ui/bottomSheet/BottomSheet는
 * 옵션 단일 선택 전용(상태 변경 시트)이라 할 일 목록+추가 버튼을 담을 수 없어,
 * 같은 Modal+slide+overlay+handle 시각 언어로 새로 만든다(계획 문서 1절 참고).
 * 항목 유무와 무관하게 항상 열리고(스펙 8절 결정 1), 빈 상태에도 추가 버튼을 둔다.
 */
export const DateTodosSheet = ({
  isOpen,
  onClose,
  dateLabel,
  selectedDate,
  todos,
  onToggleDone,
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
                <TodayTodoItem
                  key={todo.id}
                  todo={todo}
                  selectedDate={selectedDate}
                  onToggleDone={onToggleDone}
                  onPress={onPressTodo}
                />
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
  empty: {
    minHeight: 240,
  },
  footer: {
    padding: spacing.lg,
  },
});

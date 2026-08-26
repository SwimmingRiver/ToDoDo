import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { ProjectCardData } from "../../utils/projectUtils";
import { ColorDot } from "../colorDot/ColorDot";
import { ProgressBar } from "../progressBar/ProgressBar";
import { OverdueBadge } from "../overdueBadge/OverdueBadge";
import { RecurrenceBadge } from "../recurrenceBadge/RecurrenceBadge";
import { RecurrenceMissedBadge } from "../recurrenceMissedBadge/RecurrenceMissedBadge";
import { IconButton } from "../iconButton/IconButton";
import { Button } from "../button/Button";
import { ChildTodoCard } from "../childTodoCard/ChildTodoCard";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

interface ProjectCardProps {
  data: ProjectCardData;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onOpenDetail: (todo: Todo) => void;
  onOpenStatusSheet: (todo: Todo) => void;
  onDelete: (id: string) => void;
  /**
   * 스펙(design/spec.md)의 ProjectCardProps 정의에는 없는 prop이지만, 스펙 자체가
   * "펼쳤을 때 ChildTodoCard를 카드 내부에 인라인으로 노출"하도록 요구하므로(웹
   * ProjectCard의 ExpandedArea와 동일 구조), 중첩된 ChildTodoCard에 onEdit을 전달할
   * 통로가 필요하다 — onOpenStatusSheet/onDelete는 Todo/id를 그대로 받아 자식에도
   * 재사용 가능하지만 onEdit은 루트 카드 자신에는 없는 개념이라 별도로 분리했다.
   */
  onEditChild: (todo: Todo) => void;
  /** 하위 할 일 추가 버튼(펼친 상태에서만 노출) */
  onAddChild: (parentId: string) => void;
  /** 루트 카드 자신의 삭제 실패 에러 메시지 */
  error?: string;
  /** 자식 카드별 삭제 실패 에러 메시지 (todo id -> 메시지) */
  childErrors?: Record<string, string>;
}

/**
 * 웹 ProjectCard(client/src/features/todo/components/projectCard.tsx) 대응.
 * 제목 탭은 상세 화면(TodoDetailScreen) 이동으로 연결한다(웹과 동일 UX) — 펼치기/접기는
 * 화살표(chevron) 버튼 전용으로 분리되어 있다(2026-08-26 의사결정, TodoDetailScreen 도입).
 */
export const ProjectCard = ({
  data,
  isExpanded,
  onToggleExpand,
  onOpenDetail,
  onOpenStatusSheet,
  onDelete,
  onEditChild,
  onAddChild,
  error,
  childErrors,
}: ProjectCardProps) => {
  const { todo, childTodos, progress, subtaskInfo, overdueInfo, recurringMissedCount } = data;
  const { isOverdue, daysOver } = overdueInfo;

  const subtitleText =
    subtaskInfo.total > 0
      ? `${subtaskInfo.total}개 할일 · ${subtaskInfo.statusText}`
      : subtaskInfo.statusText;

  return (
    <View
      testID={`project-card-${todo.id}`}
      style={[styles.card, { borderColor: isOverdue ? colors.danger.subtle : colors.border.tertiary }]}
    >
      <View style={styles.header}>
        <ColorDot
          testID={`status-dot-${todo.id}`}
          color={isOverdue ? colors.danger.main : colors.brand.fill}
          onPress={() => onOpenStatusSheet(todo)}
          accessibilityLabel="프로젝트 상태 변경"
        />
        <Pressable
          testID={`toggle-expand-title-${todo.id}`}
          style={styles.titleArea}
          onPress={() => onOpenDetail(todo)}
          accessibilityRole="button"
        >
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {todo.title}
            </Text>
            {todo.recurrenceId != null && <RecurrenceBadge />}
            {todo.recurrenceId != null && <RecurrenceMissedBadge count={recurringMissedCount} />}
            {isOverdue && <OverdueBadge daysOver={daysOver} />}
          </View>
          <Text style={styles.subtitle}>{subtitleText}</Text>
        </Pressable>
        <View style={styles.actions}>
          <IconButton
            testID={`delete-project-${todo.id}`}
            icon={Trash2}
            variant="danger"
            accessibilityLabel="프로젝트 삭제"
            onPress={() => onDelete(todo.id)}
          />
          <Pressable
            testID={`toggle-expand-chevron-${todo.id}`}
            onPress={() => onToggleExpand(todo.id)}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? "프로젝트 접기" : "프로젝트 펼치기"}
            style={styles.expandButton}
            hitSlop={8}
          >
            {isExpanded ? (
              <ChevronDown size={15} color={colors.text.secondary} />
            ) : (
              <ChevronRight size={15} color={colors.text.secondary} />
            )}
          </Pressable>
        </View>
      </View>
      <ProgressBar progress={progress} isOverdue={isOverdue} />
      {error && <Text style={styles.error}>{error}</Text>}
      {isExpanded && (
        <View style={styles.expandedArea}>
          {childTodos.length === 0 ? (
            <Text style={styles.emptyChild}>하위 항목이 없습니다</Text>
          ) : (
            childTodos.map((child) => (
              <ChildTodoCard
                key={child.id}
                todo={child}
                onOpenStatusSheet={onOpenStatusSheet}
                onEdit={onEditChild}
                onDelete={onDelete}
                error={childErrors?.[child.id]}
              />
            ))
          )}
          <Button
            title="+ 하위 할 일 추가"
            onPress={() => onAddChild(todo.id)}
            variant="text"
            accessibilityLabel="하위 할 일 추가"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  titleArea: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  expandButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: 12,
    color: colors.danger.text,
  },
  expandedArea: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.tertiary,
    backgroundColor: colors.background.secondary,
  },
  emptyChild: {
    paddingVertical: spacing.sm,
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
});

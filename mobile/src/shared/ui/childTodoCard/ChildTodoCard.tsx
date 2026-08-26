import { StyleSheet, Text, View } from "react-native";
import { Pencil, Trash2 } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import { ColorDot } from "../colorDot/ColorDot";
import { IconButton } from "../iconButton/IconButton";
import { colors } from "../../../theme/colors";
import { statusColors } from "../../../theme/statusColors";
import { radius, spacing } from "../../../theme/spacing";

interface ChildTodoCardProps {
  todo: Todo;
  onOpenStatusSheet: (todo: Todo) => void;
  /** TodoDetailScreen으로 이동시킨다(연필 아이콘 = 상세/편집 진입점). */
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  /** 삭제 실패 시 카드 하단에 보여줄 에러 메시지 */
  error?: string;
}

/**
 * 웹 ChildTodoCard(client/src/features/todo/components/childTodoCard.tsx) 대응.
 * 루트 ProjectCard가 펼쳤을 때만 인라인으로 렌더링한다.
 */
export const ChildTodoCard = ({ todo, onOpenStatusSheet, onEdit, onDelete, error }: ChildTodoCardProps) => {
  const statusColor = statusColors[todo.status];
  const isHighPriority = todo.priority === "high";

  return (
    <View
      testID={`child-card-${todo.id}`}
      style={[
        styles.card,
        { borderColor: statusColor.border },
        isHighPriority && styles.highPriority,
      ]}
    >
      <View style={styles.row}>
        <ColorDot
          testID={`status-dot-${todo.id}`}
          color={statusColor.main}
          onPress={() => onOpenStatusSheet(todo)}
          accessibilityLabel="할 일 상태 변경"
        />
        <Text style={styles.title} numberOfLines={2}>
          {todo.title}
        </Text>
        <View style={styles.actions}>
          <IconButton
            testID={`edit-child-${todo.id}`}
            icon={Pencil}
            accessibilityLabel="할 일 편집"
            onPress={() => onEdit(todo)}
          />
          <IconButton
            testID={`delete-child-${todo.id}`}
            icon={Trash2}
            variant="danger"
            accessibilityLabel="할 일 삭제"
            onPress={() => onDelete(todo.id)}
          />
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.background.primary,
    overflow: "hidden",
  },
  highPriority: {
    borderLeftWidth: 3,
    borderLeftColor: colors.danger.main,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: "400",
    color: colors.text.primary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  error: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: 12,
    color: colors.danger.text,
  },
});

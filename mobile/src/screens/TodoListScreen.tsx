import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AlertCircle, ChevronDown, ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { useUpdateTodo } from "../hooks/useUpdateTodo";
import { Card } from "../shared/ui/card/Card";
import { StatusChip } from "../shared/ui/statusChip/StatusChip";
import { IconButton } from "../shared/ui/iconButton/IconButton";
import { DueBadge } from "../shared/ui/dueBadge/DueBadge";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { BottomSheet, type BottomSheetOption } from "../shared/ui/bottomSheet/BottomSheet";
import { colors } from "../theme/colors";
import { statusColors, type Status } from "../theme/statusColors";
import { MIN_TOUCH_TARGET, spacing } from "../theme/spacing";
import { DUE_SOON_DAYS, getDaysLeft } from "../shared/utils/due";

const STATUS_OPTIONS: BottomSheetOption<Status>[] = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

// order는 형제 그룹(루트끼리, 각 부모의 자식끼리)별로 독립적인 값이라 전역 정렬로는
// 하위 할 일이 엉뚱한 부모 밑에 붙어 보일 수 있다. 루트를 먼저 순서대로 나열하고,
// 각 루트 바로 뒤에 그 자식들을 순서대로 이어 붙여 부모-자식이 항상 인접하게 한다.
const groupByParent = (todos: Todo[]): Todo[] => {
  const roots = todos.filter((todo) => todo.parentId === null);
  return roots.flatMap((root) => [
    root,
    ...todos.filter((todo) => todo.parentId === root.id),
  ]);
};

const TodoRow = ({
  todo,
  childCount,
  isCollapsed,
  onToggleCollapse,
  onOpenStatusSheet,
  onDelete,
  isTogglingStatus,
}: {
  todo: Todo;
  childCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  onOpenStatusSheet: (todo: Todo) => void;
  onDelete: (id: string) => Promise<void>;
  isTogglingStatus: boolean;
}) => {
  const [error, setError] = useState<string | null>(null);
  const isChild = todo.parentId !== null;

  const handleDelete = async () => {
    try {
      setError(null);
      await onDelete(todo.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "할 일 삭제",
      "하위 할 일도 함께 삭제됩니다. 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: handleDelete },
      ],
    );
  };

  const daysLeft = todo.dueAt && todo.status !== "done" ? getDaysLeft(todo.dueAt) : null;
  const showDueBadge = daysLeft !== null && daysLeft <= DUE_SOON_DAYS;

  return (
    <View>
      <Card testID={`todo-row-${todo.id}`} isChild={isChild} borderColor={statusColors[todo.status].main}>
        <View style={styles.row}>
          <StatusChip
            testID={`status-toggle-${todo.id}`}
            status={todo.status}
            disabled={isTogglingStatus}
            onPress={() => onOpenStatusSheet(todo)}
          />
          <Text style={styles.title} numberOfLines={2}>
            {todo.priority === "high" && <Text style={styles.priorityMark}>! </Text>}
            {todo.title}
          </Text>
          {showDueBadge && <DueBadge daysLeft={daysLeft!} />}
          <View style={styles.actions}>
            <IconButton icon={Pencil} accessibilityLabel="할 일 편집" onPress={() => {}} />
            <IconButton icon={Trash2} variant="danger" accessibilityLabel="할 일 삭제" onPress={confirmDelete} />
            {!isChild && childCount !== undefined && (
              <Pressable
                onPress={() => onToggleCollapse?.(todo.id)}
                accessibilityRole="button"
                accessibilityLabel={isCollapsed ? "하위 할 일 펼치기" : "하위 할 일 접기"}
                style={styles.expandButton}
              >
                {isCollapsed ? (
                  <ChevronRight size={16} color={colors.text.secondary} />
                ) : (
                  <ChevronDown size={16} color={colors.text.secondary} />
                )}
                {childCount > 0 && <Text style={styles.childCount}>{childCount}</Text>}
              </Pressable>
            )}
          </View>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
    </View>
  );
};

export const TodoListScreen = () => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutateAsync: deleteTodo } = useDeleteTodo();
  const { mutate: updateTodo, isPending: isTogglingStatus } = useUpdateTodo();
  const [statusSheetTodo, setStatusSheetTodo] = useState<Todo | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const navigation = useNavigation();

  const handleOpenStatusSheet = (todo: Todo) => {
    if (isTogglingStatus) return;
    setStatusSheetTodo(todo);
  };

  const handleSelectStatus = (status: Status) => {
    if (!statusSheetTodo) return;
    updateTodo({
      id: statusSheetTodo.id,
      fields: { status, doneAt: status === "done" ? new Date().toISOString() : null },
    });
  };

  const handleToggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ListSkeleton count={5} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      </SafeAreaView>
    );
  }

  const allTodos = todos ?? [];
  const grouped = groupByParent(allTodos);
  const displayed = grouped.filter(
    (todo) => todo.parentId === null || !collapsedIds.has(todo.parentId),
  );
  const isEmpty = allTodos.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      {isEmpty ? (
        <EmptyState
          icon={ClipboardList}
          title="할 일이 없습니다"
          description="새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"
          actionLabel="새 할일 추가"
          onAction={() => navigation.navigate("TodoForm" as never)}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={displayed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TodoRow
              todo={item}
              childCount={
                item.parentId === null
                  ? allTodos.filter((t) => t.parentId === item.id).length
                  : undefined
              }
              isCollapsed={collapsedIds.has(item.id)}
              onToggleCollapse={handleToggleCollapse}
              onOpenStatusSheet={handleOpenStatusSheet}
              onDelete={deleteTodo}
              isTogglingStatus={isTogglingStatus}
            />
          )}
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("TodoForm" as never)}
        accessibilityRole="button"
        accessibilityLabel="할 일 추가"
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Plus size={16} color={colors.background.primary} />
        <Text style={styles.addButtonText}>할 일 추가</Text>
      </Pressable>

      <BottomSheet
        isOpen={statusSheetTodo !== null}
        onClose={() => setStatusSheetTodo(null)}
        title="상태 선택"
        options={STATUS_OPTIONS}
        selectedValue={statusSheetTodo?.status}
        onSelect={handleSelectStatus}
      />
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
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  priorityMark: {
    color: colors.danger.text,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  expandButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  childCount: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.danger.text,
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

import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Todo } from "@tododo/core";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useTodos } from "../hooks/useTodos";
import { useUpdateTodo } from "../hooks/useUpdateTodo";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { Button } from "../shared/ui/button/Button";
import { PriorityChips, type Priority } from "../shared/ui/priorityChips/PriorityChips";
import { DateTimeField } from "../shared/ui/dateTimeField/DateTimeField";
import { BottomSheet, type BottomSheetOption } from "../shared/ui/bottomSheet/BottomSheet";
import { ChildTodoCard } from "../shared/ui/childTodoCard/ChildTodoCard";
import { ProgressBar } from "../shared/ui/progressBar/ProgressBar";
import { RecurrenceBadge } from "../shared/ui/recurrenceBadge/RecurrenceBadge";
import { getTodoDateValidationError } from "../shared/utils/todoDateValidation";
import { getProjectProgress } from "../shared/utils/projectUtils";
import { colors } from "../theme/colors";
import { type Status } from "../theme/statusColors";
import { radius, spacing } from "../theme/spacing";

const STATUS_OPTIONS: BottomSheetOption<Status>[] = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

const STATUS_LABEL: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

export const TodoDetailScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, "TodoDetail">>();
  const { id } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: todos } = useTodos();
  const { mutateAsync: updateTodo, isPending: isSaving } = useUpdateTodo();
  const { mutateAsync: deleteTodo } = useDeleteTodo();

  const allTodos = todos ?? [];
  const todo = allTodos.find((t: Todo) => t.id === id);
  const childTodos = allTodos.filter((t: Todo) => t.parentId === id);

  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? "medium");
  const [startAt, setStartAt] = useState<string | null>(todo?.startAt ?? null);
  const [dueAt, setDueAt] = useState<string | null>(todo?.dueAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [statusSheetTodo, setStatusSheetTodo] = useState<Todo | null>(null);
  const [childErrors, setChildErrors] = useState<Record<string, string>>({});

  if (!todo) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>할 일을 찾을 수 없습니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateValidationError = getTodoDateValidationError(startAt, dueAt);

  const handleSave = async () => {
    if (dateValidationError) {
      setError(dateValidationError);
      return;
    }

    try {
      setError(null);
      await updateTodo({
        id: todo.id,
        fields: { title, description, priority, startAt, dueAt },
        title,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다");
    }
  };

  const handleDeleteSelfConfirmed = async () => {
    try {
      await deleteTodo(todo.id);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다");
    }
  };

  const handleDeleteSelfRequest = () => {
    const isRoot = todo.parentId === null;
    Alert.alert(
      isRoot ? "프로젝트 삭제" : "할 일 삭제",
      isRoot
        ? "하위 할 일도 함께 삭제됩니다. 삭제하시겠습니까?"
        : `"${todo.title}"을(를) 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: handleDeleteSelfConfirmed },
      ],
    );
  };

  const handleDeleteChild = (childId: string) => {
    const child = childTodos.find((t) => t.id === childId);
    if (!child) return;

    Alert.alert(
      "할 일 삭제",
      `"${child.title}"을(를) 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              setChildErrors((prev) => {
                if (!(childId in prev)) return prev;
                const next = { ...prev };
                delete next[childId];
                return next;
              });
              await deleteTodo(childId);
            } catch (e) {
              setChildErrors((prev) => ({
                ...prev,
                [childId]: e instanceof Error ? e.message : "삭제에 실패했습니다",
              }));
            }
          },
        },
      ],
    );
  };

  const handleSelectStatus = (status: Status) => {
    if (!statusSheetTodo) return;
    updateTodo({
      id: statusSheetTodo.id,
      fields: { status, doneAt: status === "done" ? new Date().toISOString() : null },
    });
  };

  const handleAddChild = () => {
    navigation.navigate("TodoForm", { parentId: todo.id });
  };

  const handleOpenChild = (child: Todo) => {
    navigation.navigate("TodoDetail", { id: child.id });
  };

  const isRoot = todo.parentId === null;
  const progress = isRoot ? getProjectProgress(allTodos, todo.id) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badgeRow}>
            <Pressable
              testID="detail-status-badge"
              onPress={() => setStatusSheetTodo(todo)}
              style={styles.statusBadge}
              accessibilityRole="button"
              accessibilityLabel="상태 변경"
            >
              <Text style={styles.statusBadgeText}>{STATUS_LABEL[todo.status]}</Text>
            </Pressable>
            {todo.recurrenceId != null && <RecurrenceBadge />}
          </View>

          <Text style={styles.label}>할 일</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="할 일 제목"
            placeholderTextColor={colors.text.tertiary}
            style={styles.input}
          />

          <Text style={styles.label}>설명</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="상세 설명을 입력하세요"
            placeholderTextColor={colors.text.tertiary}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={2}
          />

          <Text style={styles.label}>우선순위</Text>
          <PriorityChips value={priority} onChange={setPriority} />

          <DateTimeField label="시작일시" value={startAt} onChange={setStartAt} />
          <DateTimeField label="만료일시" value={dueAt} onChange={setDueAt} />
          {error && <Text style={styles.fieldError}>{error}</Text>}

          <Button title="저장" onPress={handleSave} disabled={isSaving} loading={isSaving} />
          <Button title="삭제" onPress={handleDeleteSelfRequest} variant="outline" />

          {isRoot && (
            <View style={styles.subtaskSection}>
              <View style={styles.subtaskHeader}>
                <Text style={styles.label}>하위 할 일 {childTodos.length}개</Text>
                <Button
                  title="+ 하위 할 일 추가"
                  onPress={handleAddChild}
                  variant="text"
                  accessibilityLabel="하위 할 일 추가"
                />
              </View>
              <ProgressBar progress={progress} />
              {childTodos.length === 0 ? (
                <Text style={styles.emptyChild}>하위 항목이 없습니다</Text>
              ) : (
                childTodos.map((child) => (
                  <ChildTodoCard
                    key={child.id}
                    todo={child}
                    onOpenStatusSheet={setStatusSheetTodo}
                    onEdit={handleOpenChild}
                    onDelete={handleDeleteChild}
                    error={childErrors[child.id]}
                  />
                ))
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
    backgroundColor: colors.background.primary,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  fieldError: {
    fontSize: 12,
    color: colors.danger.text,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.background.secondary,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.primary,
  },
  subtaskSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  subtaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyChild: {
    paddingVertical: spacing.sm,
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
});

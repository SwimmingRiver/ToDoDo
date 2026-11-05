import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  getRecurrenceValidationError,
  toFormValue,
  toRecurrenceRule,
  toRecurrenceRuleForEdit,
  type RecurrenceFormValue,
  type RecurringTodoInput,
  type Todo,
} from "@tododo/core";
import type { TodoListStackParamList } from "../navigation/types";
import { useTodos } from "../hooks/useTodos";
import { useUpdateTodo } from "../hooks/useUpdateTodo";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { useCreateRecurringTodo } from "../hooks/useCreateRecurringTodo";
import { useEditRecurringSeries } from "../hooks/useEditRecurringSeries";
import { useDeleteRecurringSeries } from "../hooks/useDeleteRecurringSeries";
import { Button } from "../shared/ui/button/Button";
import { PriorityChips, type Priority } from "../shared/ui/priorityChips/PriorityChips";
import { DateTimeField } from "../shared/ui/dateTimeField/DateTimeField";
import { BottomSheet, type BottomSheetOption } from "../shared/ui/bottomSheet/BottomSheet";
import { ChildTodoCard } from "../shared/ui/childTodoCard/ChildTodoCard";
import { ProgressBar } from "../shared/ui/progressBar/ProgressBar";
import { RecurrenceBadge } from "../shared/ui/recurrenceBadge/RecurrenceBadge";
import { RecurrenceSection } from "../shared/ui/recurrenceSection/RecurrenceSection";
import { getTodoDateValidationError } from "../shared/utils/todoDateValidation";
import { getProjectOverdue, getProjectProgress } from "../shared/utils/projectUtils";
import { colors } from "../theme/colors";
import { type Status } from "../theme/statusColors";
import { radius, spacing } from "../theme/spacing";

const STATUS_OPTIONS: BottomSheetOption<Status>[] = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

// 웹 todoDetail.tsx와 동일한 문구
const SERIES_EDIT_TITLE = "반복 일정 수정";
const SERIES_EDIT_MESSAGE =
  "이 변경은 이 일정과 이후 일정에 적용됩니다.\n\n이전 일정과 이미 완료됐거나 진행 중인 회차는 그대로 유지됩니다.";
const SERIES_SAVE_ERROR = "반복 일정 저장 중 오류가 발생했습니다. 다시 시도해주세요";
const CONVERSION_CLEANUP_ERROR =
  "새 반복 일정은 생성되었지만 기존 항목 정리에 실패했습니다. 목록을 확인해주세요";

const STATUS_LABEL: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

export const TodoDetailScreen = () => {
  const route = useRoute<RouteProp<TodoListStackParamList, "TodoDetail">>();
  const { id } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<TodoListStackParamList>>();
  const { data: todos } = useTodos();
  const {
    mutateAsync: updateTodo,
    mutate: updateTodoStatus,
    isPending: isSaving,
  } = useUpdateTodo();
  const { mutateAsync: deleteTodo, isPending: isDeletePending } = useDeleteTodo();
  const { mutateAsync: createRecurringTodo, isPending: isCreateRecurringPending } =
    useCreateRecurringTodo();
  const { mutateAsync: editRecurringSeries, isPending: isEditSeriesPending } =
    useEditRecurringSeries();
  const { mutateAsync: deleteRecurringSeries, isPending: isDeleteSeriesPending } =
    useDeleteRecurringSeries();
  const isSavePending =
    isSaving || isCreateRecurringPending || isEditSeriesPending || !!isDeletePending;
  // 시리즈 삭제 중 저장이 끼어들면 editRecurringSeries가 삭제된 시리즈를 되살릴 수 있어
  // 삭제 pending도 저장 잠금 조건에 포함한다(저장 버튼 스피너는 저장 중에만 보인다).
  const isSaveLocked = isSavePending || isDeleteSeriesPending;
  // isPending은 다음 렌더에서야 반영되므로, 같은 틱 안의 연속 탭(Alert 버튼 두 번 등)은
  // ref로 막는다. 저장과 시리즈 삭제가 같은 ref를 공유해 서로도 겹치지 않는다.
  const saveInFlightRef = useRef(false);

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
  const [recurrenceValue, setRecurrenceValue] = useState<RecurrenceFormValue | null>(
    toFormValue(todo?.recurrence),
  );

  // 시작일시가 지워지면 반복은 의미가 없으므로 끈다 (웹 todoDetail과 동일)
  useEffect(() => {
    if (!startAt) setRecurrenceValue(null);
  }, [startAt]);

  // 마운트 시점에 useTodos() 캐시가 아직 채워지지 않아 todo가 undefined였다가
  // 나중에 도착하는 경우, useState 초기값만으로는 절대 갱신되지 않는다(초기화는
  // 최초 렌더에서 딱 한 번만 실행됨). todo.id가 바뀔 때마다(최초 로딩 포함)
  // 폼 값을 다시 시딩해 이 레이스를 방지한다.
  useEffect(() => {
    if (!todo) return;
    setTitle(todo.title);
    setDescription(todo.description ?? "");
    setPriority(todo.priority);
    setStartAt(todo.startAt);
    setDueAt(todo.dueAt);
    setRecurrenceValue(toFormValue(todo.recurrence));
  }, [todo?.id]);

  if (!todo) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>할 일을 찾을 수 없습니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateValidationError = getTodoDateValidationError(startAt, dueAt);

  const runSave = async (task: () => Promise<void>) => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      await task();
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const handleConfirmSeriesEdit = (updated: RecurringTodoInput & { id: string }) =>
    runSave(async () => {
      try {
        setError(null);
        await editRecurringSeries(updated);
        navigation.goBack();
      } catch {
        setError(SERIES_SAVE_ERROR);
      }
    });

  const handleSave = async () => {
    if (saveInFlightRef.current || isSaveLocked) return;
    if (dateValidationError) {
      setError(dateValidationError);
      return;
    }

    // 웹 todoDetail과 동일: 이미 반복 중인 시리즈를 수정할 때 dueAt은 시리즈 종료일이 아니라
    // 이 회차의 날짜다. 그래서 범위 검증(dueAt < startAt)은 건너뛰고(회차 날짜 검증은 위에서
    // 이미 했다), 종료 조건은 기존 규칙에서 그대로 가져온다. 비반복→반복 전환은 dueAt에서 유도한다.
    const existingRule = todo.recurrence ?? null;
    const recurrenceError = existingRule
      ? getRecurrenceValidationError(recurrenceValue, null, null)
      : getRecurrenceValidationError(recurrenceValue, startAt, dueAt);
    if (recurrenceError) {
      setError(recurrenceError);
      return;
    }

    const updated = {
      ...todo,
      title,
      description,
      priority,
      startAt,
      dueAt,
      recurrence: existingRule
        ? toRecurrenceRuleForEdit(recurrenceValue, existingRule)
        : toRecurrenceRule(recurrenceValue, dueAt),
    };

    // 웹과 동일: 반복 시리즈였던 할 일의 저장(규칙 변경·끄기·일반 필드만 수정 모두)은
    // 시리즈 전체 수정 확인을 먼저 거친다.
    if (existingRule) {
      Alert.alert(SERIES_EDIT_TITLE, SERIES_EDIT_MESSAGE, [
        { text: "취소", style: "cancel" },
        { text: "전체 적용", onPress: () => handleConfirmSeriesEdit(updated) },
      ]);
      return;
    }

    if (updated.recurrence != null) {
      // 비반복 → 반복 전환: editRecurringSeries는 recurrenceId가 필요하므로 새 시리즈를
      // 먼저 만들고, 성공한 뒤에만 원본을 지운다.
      await runSave(async () => {
        try {
          setError(null);
          await createRecurringTodo(updated);
        } catch (e) {
          setError(e instanceof Error ? e.message : "저장에 실패했습니다");
          return;
        }
        try {
          await deleteTodo(todo.id);
        } catch {
          Alert.alert("정리 실패", CONVERSION_CLEANUP_ERROR);
        }
        navigation.goBack();
      });
      return;
    }

    await runSave(async () => {
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
    });
  };

  const handleDeleteSelfConfirmed = async () => {
    try {
      await deleteTodo(todo.id);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다");
    }
  };

  const handleDeleteSeriesConfirmed = (recurrenceId: string) =>
    runSave(async () => {
      try {
        await deleteRecurringSeries(recurrenceId);
        navigation.goBack();
      } catch (e) {
        setError(e instanceof Error ? e.message : "삭제에 실패했습니다");
      }
    });

  const handleDeleteSelfRequest = () => {
    const { recurrenceId } = todo;
    if (recurrenceId) {
      Alert.alert(
        "할 일 삭제",
        `"${todo.title}"은(는) 반복 일정입니다.\n\n삭제하면 이 반복 시리즈의 모든 일정이 함께 삭제됩니다.`,
        [
          { text: "취소", style: "cancel" },
          {
            text: "삭제",
            style: "destructive",
            onPress: () => handleDeleteSeriesConfirmed(recurrenceId),
          },
        ],
      );
      return;
    }

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

  const handleOpenStatusSheet = (target: Todo) => {
    if (isSaving) return;
    setStatusSheetTodo(target);
  };

  const handleSelectStatus = (status: Status) => {
    if (!statusSheetTodo) return;
    updateTodoStatus({
      id: statusSheetTodo.id,
      fields: { status, doneAt: status === "done" ? new Date().toISOString() : null },
    });
  };

  const handleAddChild = () => {
    navigation.navigate("TodoForm", { parentId: todo.id });
  };

  const handleOpenChild = (child: Todo) => {
    // navigation.navigate("TodoDetail", ...)를 쓰면 이미 포커스된 같은 라우트
    // 이름이라 React Navigation이 새 화면을 쌓지 않고 기존 인스턴스를 재사용한다
    // (params만 교체, key는 그대로) — 그러면 title/description 등 useState로 시딩된
    // 필드가 새 자식으로 리셋되지 않아 저장 시 부모 값으로 자식을 덮어쓰게 된다.
    // push는 항상 새 인스턴스를 만들어 이 문제를 피한다.
    navigation.push("TodoDetail", { id: child.id });
  };

  const isRoot = todo.parentId === null;
  const progress = isRoot ? getProjectProgress(allTodos, todo.id) : 0;
  const isOverdue = isRoot ? getProjectOverdue(allTodos, todo).isOverdue : false;
  const hasChildren = childTodos.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badgeRow}>
            <Pressable
              testID="detail-status-badge"
              onPress={() => handleOpenStatusSheet(todo)}
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
          {isRoot && (
            <RecurrenceSection
              disabled={hasChildren || !startAt}
              disabledReason={hasChildren ? "hasChildren" : "noStartAt"}
              startAt={startAt}
              dueAt={dueAt}
              value={recurrenceValue}
              onChange={setRecurrenceValue}
              existingRule={todo.recurrence}
            />
          )}
          {error && <Text style={styles.fieldError}>{error}</Text>}

          <Button
            title="저장"
            onPress={handleSave}
            disabled={isSaveLocked}
            loading={isSavePending}
          />
          <Button title="삭제" onPress={handleDeleteSelfRequest} variant="outline" />

          {isRoot && (
            <View style={styles.subtaskSection}>
              <View style={styles.subtaskHeader}>
                <Text style={styles.label}>하위 할 일 {childTodos.length}개</Text>
                {/* 반복 할 일은 하위 할 일을 가질 수 없다. 웹과 같이 recurrenceId가 아니라
                    현재 반복 규칙(recurrence) 유무로 판단한다. */}
                {todo.recurrence == null && (
                  <Button
                    title="+ 하위 할 일 추가"
                    onPress={handleAddChild}
                    variant="text"
                    accessibilityLabel="하위 할 일 추가"
                  />
                )}
              </View>
              <ProgressBar progress={progress} isOverdue={isOverdue} />
              {childTodos.length === 0 ? (
                <Text style={styles.emptyChild}>하위 항목이 없습니다</Text>
              ) : (
                childTodos.map((child) => (
                  <ChildTodoCard
                    key={child.id}
                    todo={child}
                    onOpenStatusSheet={handleOpenStatusSheet}
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

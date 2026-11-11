import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { TodoListStackParamList } from "../navigation/types";
import { getRecurrenceValidationError, toRecurrenceRule, type RecurrenceFormValue } from "@tododo/core";
import { useCreateTodo } from "../hooks/useCreateTodo";
import { useCreateRecurringTodo } from "../hooks/useCreateRecurringTodo";
import { useTodos } from "../hooks/useTodos";
import { Button } from "../shared/ui/button/Button";
import { PriorityChips, type Priority } from "../shared/ui/priorityChips/PriorityChips";
import { DateTimeField } from "../shared/ui/dateTimeField/DateTimeField";
import { RecurrenceSection } from "../shared/ui/recurrenceSection/RecurrenceSection";
import { getTodoDateValidationError } from "../shared/utils/todoDateValidation";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

export const TodoFormScreen = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [startAt, setStartAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<TodoListStackParamList, "TodoForm">>();
  const parentId = route.params?.parentId ?? null;
  const [dueAt, setDueAt] = useState<string | null>(route.params?.dueAt ?? null);
  // dueAt이 프리필된 경우(TodayScreen에서 날짜를 선택하고 넘어온 경우) 사용자가
  // "더보기"를 눌러야만 보이는 문제를 막기 위해 처음부터 펼쳐서 보여준다.
  const [showMore, setShowMore] = useState(!!route.params?.dueAt);
  const [recurrenceValue, setRecurrenceValue] = useState<RecurrenceFormValue | null>(null);
  const { mutateAsync, isPending: isCreatePending } = useCreateTodo();
  const { mutateAsync: createRecurringTodo, isPending: isRecurringPending } = useCreateRecurringTodo();
  const isPending = isCreatePending || isRecurringPending;
  // isPending은 다음 렌더에서야 반영되므로, 같은 틱 안의 연속 탭은 ref로 막는다.
  const submitInFlightRef = useRef(false);
  const { data: todos } = useTodos();

  // 반복을 켜 두는 동안 만료일시는 회차에 쓰이지 않으므로 숨기고 검증에서도 뺀다.
  // 값은 지우지 않아 반복을 끄면 그대로 다시 보인다(웹 todoForm과 동일).
  const hideDueAt = recurrenceValue !== null;
  const dateValidationError = getTodoDateValidationError(startAt, hideDueAt ? null : dueAt);

  // 시작일시가 지워지면 반복은 의미가 없으므로 끈다 (웹 todoForm과 동일)
  useEffect(() => {
    if (!startAt) setRecurrenceValue(null);
  }, [startAt]);

  const handleSubmit = async () => {
    if (submitInFlightRef.current || isPending) return;
    if (!title.trim()) return;
    if (dateValidationError) {
      setError(dateValidationError);
      setShowMore(true);
      return;
    }

    const recurrenceError = getRecurrenceValidationError(recurrenceValue, startAt);
    if (recurrenceError) {
      setError(recurrenceError);
      setShowMore(true);
      return;
    }

    submitInFlightRef.current = true;
    try {
      setError(null);
      if (recurrenceValue) {
        // order는 core createRecurringTodo가 루트 할 일 기준으로 직접 계산한다.
        await createRecurringTodo({
          title,
          description,
          priority,
          startAt,
          dueAt,
          parentId: null,
          recurrence: toRecurrenceRule(recurrenceValue),
        });
        navigation.goBack();
        return;
      }
      const siblingOrders = (todos ?? [])
        .filter((todo) => todo.parentId === parentId)
        .map((todo) => todo.order);
      const nextOrder = Math.max(-1, ...siblingOrders) + 1;
      await mutateAsync({
        title,
        description,
        priority,
        // dueAt/startAt은 네이티브 피커가 반환한 Date를 DateTimeField에서 이미
        // toISOString()(UTC "Z")으로 변환해 전달한다. 로컬 문자열을 자르거나
        // 조합하지 않는다 — 과거 이 프로젝트에서 반복된 버그 패턴(split("T")[0])이다.
        startAt,
        dueAt,
        parentId,
        order: nextOrder,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "할 일 추가에 실패했습니다");
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>할 일</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="할 일 제목"
            placeholderTextColor={colors.text.tertiary}
            style={styles.input}
            autoFocus
          />

          {showMore && (
            <View style={styles.detail}>
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
              {!hideDueAt && <DateTimeField label="만료일시" value={dueAt} onChange={setDueAt} />}
              {dateValidationError && <Text style={styles.fieldError}>{dateValidationError}</Text>}
              {!parentId && (
                <RecurrenceSection
                  disabled={!startAt}
                  disabledReason="noStartAt"
                  startAt={startAt}
                  value={recurrenceValue}
                  onChange={setRecurrenceValue}
                />
              )}
            </View>
          )}

          <Button
            title={showMore ? "간단히" : "더보기"}
            onPress={() => setShowMore(!showMore)}
            variant="text"
            style={styles.moreButton}
          />

          <Button
            title={isPending ? "추가 중..." : "추가"}
            onPress={handleSubmit}
            disabled={isPending}
            loading={isPending}
          />
          {error && <Text style={styles.formError}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
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
  detail: {
    gap: spacing.md,
  },
  moreButton: {
    alignSelf: "flex-end",
  },
  fieldError: {
    fontSize: 12,
    color: colors.danger.text,
  },
  formError: {
    fontSize: 12,
    color: colors.danger.text,
    textAlign: "center",
  },
});

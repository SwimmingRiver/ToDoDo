import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useCreateTodo } from "../hooks/useCreateTodo";
import { useTodos } from "../hooks/useTodos";
import { Button } from "../shared/ui/button/Button";
import { PriorityChips, type Priority } from "../shared/ui/priorityChips/PriorityChips";
import { DateTimeField } from "../shared/ui/dateTimeField/DateTimeField";
import { getTodoDateValidationError } from "../shared/utils/todoDateValidation";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

export const TodoFormScreen = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [startAt, setStartAt] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "TodoForm">>();
  const parentId = route.params?.parentId ?? null;
  const { mutateAsync, isPending } = useCreateTodo();
  const { data: todos } = useTodos();

  const dateValidationError = getTodoDateValidationError(startAt, dueAt);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (dateValidationError) {
      setError(dateValidationError);
      setShowMore(true);
      return;
    }

    try {
      setError(null);
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
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
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
              <DateTimeField label="만료일시" value={dueAt} onChange={setDueAt} />
              {dateValidationError && <Text style={styles.fieldError}>{dateValidationError}</Text>}
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

import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../shared/ui/button/Button";
import { colors } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../theme/spacing";
import { FeedbackError, submitFeedback } from "./feedbackProxyApi";

const MAX_LENGTH = 1000;
const CLOSE_DELAY_MS = 1500;
const PLACEHOLDER = "불편한 점이나 바라는 기능을 자유롭게 적어주세요.";
const SUCCESS_MESSAGE = "감사합니다! 의견이 전달되었습니다.";
const TOO_FREQUENT_MESSAGE = "잠시 후 다시 보내주세요. 짧은 시간에 너무 많이 보냈어요.";
const UNKNOWN_MESSAGE = "전송에 실패했습니다. 잠시 후 다시 시도해주세요.";

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  // 닫힐 때 입력·상태를 비운다(AccountScreen이 언마운트되지 않으므로 여기서 초기화).
  useEffect(() => {
    if (visible) return;
    clearTimer();
    setText("");
    setIsSubmitting(false);
    setIsSent(false);
    setErrorMessage(null);
  }, [visible]);

  const canSubmit = text.trim().length > 0 && !isSubmitting && !isSent;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await submitFeedback(text);
      setIsSent(true);
      timerRef.current = setTimeout(onClose, CLOSE_DELAY_MS);
    } catch (error) {
      setErrorMessage(error instanceof FeedbackError && error.code === "TOO_FREQUENT" ? TOO_FREQUENT_MESSAGE : UNKNOWN_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>의견 보내기</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              hitSlop={8}
              style={styles.close}
            >
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={PLACEHOLDER}
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
              editable={!isSubmitting && !isSent}
            />
            <Text style={styles.counter}>{`${text.length}/${MAX_LENGTH}`}</Text>
            {isSent && <Text style={styles.success}>{SUCCESS_MESSAGE}</Text>}
            {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
            <Button title="보내기" onPress={() => void handleSubmit()} disabled={!canSubmit} loading={isSubmitting} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.secondary },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.text.primary },
  close: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  closeText: { fontSize: 16, color: colors.brand.strong },
  body: { flex: 1, padding: spacing.lg, gap: spacing.md },
  input: {
    flex: 1,
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text.primary,
  },
  counter: { alignSelf: "flex-end", fontSize: 13, color: colors.text.tertiary },
  success: { fontSize: 14, color: colors.brand.strong },
  error: { fontSize: 14, color: colors.danger.text },
});

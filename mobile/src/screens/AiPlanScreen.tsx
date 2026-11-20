import { useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  AiPlanError,
  aiPlanErrorMessage,
  checkedCount,
  toSubmission,
  type GeneratePlanInput,
  type PlanUsage,
} from "@tododo/core/dist/aiPlan/index.js";
import { useCreatePlanTodos, useGeneratePlan, usePlanDraft } from "../aiPlan";
import { PlanGoalStep } from "../aiPlan/components/PlanGoalStep";
import { PlanLockedNotice } from "../aiPlan/components/PlanLockedNotice";
import { PlanPreviewStep } from "../aiPlan/components/PlanPreviewStep";
import { useIsPremium } from "../premium";
import { toDateKey } from "../shared/utils/dateRange";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

// Task 6에서 실제 스택 타입으로 좁힌다.
type AiPlanNavigation = { navigate: (name: "Account") => void; goBack: () => void };

export const AiPlanScreen = () => {
  const navigation = useNavigation() as unknown as AiPlanNavigation;
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const generate = useGeneratePlan();
  const createPlan = useCreatePlanTodos();
  const { draft, dispatch } = usePlanDraft();

  const today = toDateKey(new Date());
  const [goal, setGoal] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [step, setStep] = useState<"goal" | "preview">("goal");
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [lastInput, setLastInput] = useState<GeneratePlanInput | null>(null);
  // 클레임 전파 지연 등으로 서버가 403을 주면 UI 판정과 무관하게 잠금 안내로 전환한다.
  const [serverLocked, setServerLocked] = useState(false);
  // isPending은 다음 렌더에서야 반영되므로, 같은 틱 안의 연속 탭은 ref로 막는다.
  const generateInFlight = useRef(false);
  const saveInFlight = useRef(false);
  // Task 6의 이탈 가드가 저장 성공 후 goBack을 막지 않도록 쓴다.
  const savedRef = useRef(false);

  const runGenerate = (input: GeneratePlanInput) => {
    if (generate.isPending || generateInFlight.current) return;
    generateInFlight.current = true;
    setLastInput(input);
    generate.mutate(input, {
      onSuccess: (result) => {
        dispatch({ type: "load", plan: result.plan });
        setUsage(result.usage);
        setStep("preview");
      },
      onError: (error) => {
        if (error instanceof AiPlanError && error.code === "PREMIUM_REQUIRED") {
          setServerLocked(true);
          return;
        }
        const { title, message } = aiPlanErrorMessage(error);
        Alert.alert(title, message);
      },
      onSettled: () => {
        generateInFlight.current = false;
      },
    });
  };

  const handleGoalSubmit = () => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    runGenerate({ goal: trimmed, dueDate: dueDate || null, today });
  };

  const requestRegenerate = () => {
    if (!lastInput) return;
    if (draft.dirty) {
      Alert.alert(
        "수정한 내용이 사라져요",
        "다시 만들면 편집한 계획이 새 결과로 바뀌고 사용 횟수가 1회 차감돼요.",
        [
          { text: "계속 편집", style: "cancel" },
          { text: "다시 만들기", onPress: () => runGenerate(lastInput) },
        ],
      );
      return;
    }
    runGenerate(lastInput);
  };

  const handleSubmit = () => {
    if (createPlan.isPending || saveInFlight.current) return;
    saveInFlight.current = true;
    const addedCount = checkedCount(draft);
    createPlan.mutate(toSubmission(draft), {
      onSuccess: () => {
        Alert.alert("계획 추가 완료", `할 일 ${addedCount}개를 추가했어요`);
        savedRef.current = true;
        navigation.goBack();
      },
      onError: () => {
        Alert.alert("추가하지 못했어요", "잠시 후 다시 시도해 주세요");
      },
      onSettled: () => {
        saveInFlight.current = false;
      },
    });
  };

  const renderBody = () => {
    if (isEntitlementLoading) return null;
    if (!isPremium || serverLocked) {
      return <PlanLockedNotice onSubscribe={() => navigation.navigate("Account")} />;
    }
    if (step === "goal") {
      return (
        <PlanGoalStep
          goal={goal}
          dueDate={dueDate}
          today={today}
          isPending={generate.isPending}
          onGoalChange={setGoal}
          onDueDateChange={setDueDate}
          onSubmit={handleGoalSubmit}
        />
      );
    }
    return (
      <PlanPreviewStep
        draft={draft}
        dispatch={dispatch}
        usage={usage}
        today={today}
        isRegenerating={generate.isPending}
        isSaving={createPlan.isPending}
        onRegenerate={requestRegenerate}
        onSubmit={handleSubmit}
      />
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {renderBody()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  content: { padding: spacing.lg },
});

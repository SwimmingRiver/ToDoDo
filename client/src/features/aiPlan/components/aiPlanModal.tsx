import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PremiumLockedNotice, useIsPremium, useUpgradeInterest } from "@/features/entitlement";
import { useCreatePlanTodos } from "@/features/todo/hooks";
import { ConfirmModal, useToast } from "@/shared";
import {
  ModalBackground,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
} from "@/shared/ui/modal/modal.styles";
import { toDateKey } from "@/shared/utils/date";
import { AiPlanError, type GeneratePlanInput, type PlanUsage } from "../api";
import { useGeneratePlan, usePlanDraft, toSubmission, checkedCount } from "../hooks";
import { aiPlanErrorMessage } from "../utils/aiPlanErrorMessage";
import PlanGoalStep from "./planGoalStep";
import PlanPreviewStep from "./planPreviewStep";

type PendingConfirm = "close" | "regenerate" | null;

/**
 * 공용 Modal은 푸터가 TodoForm 전용 "저장" 버튼으로 고정돼 있어, 스타일만 재사용하고
 * 단계별 푸터는 각 단계 컴포넌트가 그린다. 열림 여부는 호출부가 조건부 렌더로 관리한다.
 * ConfirmModal은 모달 컨테이너의 형제로 둔다(부모가 먼저 unmount돼 확인창이 같이
 * 사라지는 문제 방지).
 */
const AiPlanModal = ({ onClose }: { onClose: () => void }) => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const { submitInterest } = useUpgradeInterest("AI 할 일 플랜 기능");
  const toast = useToast();
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
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  // isPending은 mutate 직후 즉시 반영되지 않아(다음 렌더까지 지연) 동기 더블클릭이
  // 두 번째 mutate 호출을 막지 못할 수 있다. ref 플래그로 그 틈을 막는다.
  const generateInFlight = useRef(false);
  const saveInFlight = useRef(false);

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
        toast.error(title, message);
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

  const requestClose = () => {
    // 생성 요청 중에는 닫기를 막는다. AI 호출 하나가 유료 사용 횟수를 소모하는데,
    // 닫아버리면 결과를 못 받고 그 시도만 날아간다.
    if (generate.isPending) return;
    if (step === "preview" && draft.dirty) {
      setPendingConfirm("close");
      return;
    }
    onClose();
  };

  const requestRegenerate = () => {
    if (!lastInput) return;
    if (draft.dirty) {
      setPendingConfirm("regenerate");
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
        toast.success("계획 추가 완료", `할 일 ${addedCount}개를 추가했어요`);
        onClose();
      },
      onError: () => {
        toast.error("추가하지 못했어요", "잠시 후 다시 시도해 주세요");
      },
      onSettled: () => {
        saveInFlight.current = false;
      },
    });
  };

  const handleConfirm = () => {
    const action = pendingConfirm;
    setPendingConfirm(null);
    if (action === "close") onClose();
    if (action === "regenerate" && lastInput) runGenerate(lastInput);
  };

  const renderBody = () => {
    if (isEntitlementLoading) return null;
    if (!isPremium || serverLocked) {
      return (
        <PremiumLockedNotice
          title="AI 할 일 플랜은 프리미엄 기능입니다"
          description="목표를 적으면 AI가 실행 단계와 날짜를 나눠 제안해요. 프리미엄 구독이 필요합니다"
          ctaLabel="관심 있어요"
          onCtaClick={submitInterest}
        />
      );
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
          onCancel={requestClose}
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
        onCancel={requestClose}
        onSubmit={handleSubmit}
      />
    );
  };

  return (
    <>
      {createPortal(
        <ModalBackground onClick={requestClose}>
          <ModalContainer role="dialog" aria-modal="true" aria-label="AI로 계획" onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalCloseButton onClick={requestClose} disabled={generate.isPending} aria-label="모달 닫기">
                X
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>{renderBody()}</ModalBody>
          </ModalContainer>
        </ModalBackground>,
        document.body,
      )}
      <ConfirmModal
        isOpen={pendingConfirm !== null}
        title="수정한 내용이 사라져요"
        message={pendingConfirm === "regenerate" ? "다시 만들면 편집한 계획이 새 결과로 바뀌고 사용 횟수가 1회 차감돼요." : "편집한 계획을 저장하지 않고 닫을까요?"}
        confirmText={pendingConfirm === "regenerate" ? "다시 만들기" : "닫기"}
        cancelText="계속 편집"
        onConfirm={handleConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
};

export default AiPlanModal;

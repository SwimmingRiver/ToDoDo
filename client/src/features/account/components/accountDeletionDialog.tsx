import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmModal, useToast } from "@/shared";
import { auth } from "@/shared/lib/firebase";
import { useAuth } from "@/features/auth/context/useAuth";
import { useEntitlement } from "@/features/entitlement";
import { clearSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { deleteAccount, type AccountDeletionStep } from "../api/deleteAccount";

const BASE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
const SUBSCRIPTION_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";
const FAILURE_MESSAGE = "일부만 처리되었습니다. 다시 시도해 주세요.";
const STEP_LABEL: Record<AccountDeletionStep, string> = {
  calendar: "구글 캘린더 연동 해제 중…",
  reminders: "알림 정리 중…",
  account: "계정과 데이터 삭제 중…",
};
const KEEP_OPEN_NOTICE = "완료될 때까지 창을 닫지 마세요.";

interface AccountDeletionDialogProps {
  onClose: () => void;
}

/** 열려 있을 때만 렌더한다(부모가 조건부 마운트). 라우터·쿼리 의존성을 프로필 메뉴에서 떼어 두기 위해서다. */
const AccountDeletionDialog = ({ onClose }: AccountDeletionDialogProps) => {
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const [step, setStep] = useState<AccountDeletionStep>("calendar");
  const { logout } = useAuth();
  const { data: entitlement } = useEntitlement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const hasSubscription = entitlement?.source === "paddle" && entitlement.status !== "canceled";
  const isPending = status === "pending";

  // 진행 중 탭을 닫으면 일부 단계만 처리된 채 남는다. 브라우저 기본 확인 창으로 한 번 막는다.
  useEffect(() => {
    if (!isPending) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isPending]);

  const handleConfirm = async () => {
    if (isPending) return;
    const uid = auth.currentUser?.uid;
    setStep("calendar");
    setStatus("pending");
    try {
      await deleteAccount(setStep);
    } catch (error) {
      console.error("회원 탈퇴 실패:", error);
      setStatus("failed");
      return;
    }
    if (uid) clearSnapshot(uid);
    try {
      await logout();
    } catch (error) {
      // 서버 쪽 계정은 이미 사라졌다. 로그아웃 실패로 창을 pending에 가두지 말고 정리를 끝까지 진행한다.
      console.error("탈퇴 후 로그아웃 실패:", error);
    }
    queryClient.clear();
    navigate("/", { replace: true });
    toast.success("탈퇴가 완료되었습니다");
  };

  const message = [BASE_MESSAGE, hasSubscription && SUBSCRIPTION_NOTICE, status === "failed" && FAILURE_MESSAGE]
    .filter(Boolean)
    .join("\n\n");

  return (
    <ConfirmModal
      isOpen
      title="회원 탈퇴"
      message={message}
      confirmText={isPending ? "탈퇴 처리 중…" : "탈퇴하기"}
      pending={isPending}
      statusMessage={isPending ? `${STEP_LABEL[step]}\n${KEEP_OPEN_NOTICE}` : undefined}
      onConfirm={handleConfirm}
      onCancel={() => {
        if (!isPending) onClose();
      }}
    />
  );
};

export default AccountDeletionDialog;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmModal, useToast } from "@/shared";
import { auth } from "@/shared/lib/firebase";
import { useAuth } from "@/features/auth/context/useAuth";
import { useEntitlement } from "@/features/entitlement";
import { clearSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { deleteAccount } from "../api/deleteAccount";

const BASE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
const SUBSCRIPTION_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";
const FAILURE_MESSAGE = "일부만 처리되었습니다. 다시 시도해 주세요.";

interface AccountDeletionDialogProps {
  onClose: () => void;
}

/** 열려 있을 때만 렌더한다(부모가 조건부 마운트). 라우터·쿼리 의존성을 프로필 메뉴에서 떼어 두기 위해서다. */
const AccountDeletionDialog = ({ onClose }: AccountDeletionDialogProps) => {
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const { logout } = useAuth();
  const { data: entitlement } = useEntitlement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const hasSubscription = entitlement?.source === "paddle" && entitlement.status !== "canceled";
  const isPending = status === "pending";

  const handleConfirm = async () => {
    if (isPending) return;
    const uid = auth.currentUser?.uid;
    setStatus("pending");
    try {
      await deleteAccount();
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
      confirmDisabled={isPending}
      onConfirm={handleConfirm}
      onCancel={() => {
        if (!isPending) onClose();
      }}
    />
  );
};

export default AccountDeletionDialog;

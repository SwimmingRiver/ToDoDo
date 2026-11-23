import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmModal, useToast } from "@/shared";
import { auth } from "@/shared/lib/firebase";
import { useAuth } from "@/features/auth/context/useAuth";
import { useEntitlement } from "@/features/entitlement";
import { clearSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { isUserCancelledSignIn } from "@tododo/core/dist/auth/index.js";
import { isAutoRenewingStore } from "@tododo/core/dist/entitlement/index.js";
import { deleteAccount, type AccountDeletionStep } from "../api/deleteAccount";
import { warmUpPopupResolver } from "@/features/auth/api/warmUpPopup";

const BASE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
const SUBSCRIPTION_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";
// Apple은 서버가 해지할 수 없어 경고하고, Google은 서버가 탈퇴 때 함께 해지하므로 안내만 한다(스펙 7절).
const APPLE_WARNING = "App Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.";
const GOOGLE_NOTICE = "Google Play 구독은 탈퇴하면 함께 해지돼요.";
const APPLE_REAUTH_NOTICE = "Apple 계정 확인 창이 한 번 더 열려요.";
const FAILURE_MESSAGE = "일부만 처리되었습니다. 다시 시도해 주세요.";
// Apple 단계는 맨 앞이라 여기서 실패하면 아무것도 지우지 않았다.
const APPLE_FAILURE_MESSAGE = "Apple 확인에 실패해 아무것도 삭제되지 않았어요. 다시 시도해 주세요.";
const APPLE_POPUP_BLOCKED_MESSAGE = "Apple 확인 창이 열리지 않았어요. 아무것도 삭제되지 않았으니 한 번 더 눌러 주세요.";
const STEP_LABEL: Record<AccountDeletionStep, string> = {
  apple: "Apple 연결 해제 중…",
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
  const [popupBlocked, setPopupBlocked] = useState(false);
  const { logout } = useAuth();
  const { data: entitlement } = useEntitlement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const paddleRecord = entitlement?.sources.paddle;
  const hasSubscription = !!paddleRecord && paddleRecord.status !== "canceled";
  // 스토어별로 따로 본다 — 둘 다 자동 갱신 중이면 경고와 안내가 함께 나온다. 경고는 안내일 뿐 탈퇴를 막지 않는다.
  const appleRenewing = !!entitlement && isAutoRenewingStore(entitlement, "apple");
  const googleRenewing = !!entitlement && isAutoRenewingStore(entitlement, "google");
  const isAppleUser = !!auth.currentUser?.providerData.some((p) => p.providerId === "apple.com");
  const isPending = status === "pending";

  // Apple 재인증 팝업이 첫 클릭에 열리도록 처리기를 미리 준비한다(Safari, warmUpPopup.ts).
  useEffect(() => {
    if (isAppleUser) warmUpPopupResolver();
  }, [isAppleUser]);

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
    setPopupBlocked(false);
    setStatus("pending");
    try {
      await deleteAccount(setStep);
    } catch (error) {
      // Apple 재인증 창을 닫은 경우: 아무것도 지워지지 않았으니 조용히 처음 상태로
      if (isUserCancelledSignIn((error as { code?: unknown } | null)?.code)) {
        setStatus("idle");
        return;
      }
      console.error("회원 탈퇴 실패:", error);
      // 처리기 준비 전에 눌렀거나 준비가 실패하면 Safari가 막는다 — 두 번째 클릭은 열린다.
      setPopupBlocked((error as { code?: unknown } | null)?.code === "auth/popup-blocked");
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

  const message = [
    BASE_MESSAGE,
    hasSubscription && SUBSCRIPTION_NOTICE,
    appleRenewing && APPLE_WARNING,
    googleRenewing && GOOGLE_NOTICE,
    isAppleUser && APPLE_REAUTH_NOTICE,
    // step은 onStep이 마지막으로 알린 단계 = 실패한 단계다.
    status === "failed" &&
      (step === "apple" ? (popupBlocked ? APPLE_POPUP_BLOCKED_MESSAGE : APPLE_FAILURE_MESSAGE) : FAILURE_MESSAGE),
  ]
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

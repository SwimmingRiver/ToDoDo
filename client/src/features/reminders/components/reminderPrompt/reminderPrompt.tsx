import { useCallback, useMemo, useState } from "react";
import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import {
  DEFAULT_REMINDER_SETTING,
  reminderSettingLabel,
} from "@tododo/core/dist/reminders/index.js";
// @/shared 배럴은 linkifyjs 등까지 끌어온다. App 청크(모든 보호 라우트의 공통 경로)에
// 들어가므로 직접 경로로 가져온다.
import ConfirmModal from "@/shared/ui/confirmModal/confirmModal";
import { useToast } from "@/shared/ui/toast/useToast";
import { getPushPermission } from "../../push/pushSupport";
import { useReminderDefault } from "../../hooks/useReminderSettings";
import { ReminderPromptContext, isPromptSnoozed, PROMPT_SNOOZE_KEY, PROMPT_SNOOZE_MS } from "./reminderPromptContext";

// PROMPT_SNOOZE_KEY/PROMPT_SNOOZE_MS/useReminderPrompt는 컴포넌트가 아니라
// react-refresh/only-export-components에 걸리므로(재노출도 포함) 이 파일에서
// export하지 않는다 — reminderPromptContext.ts에서 바로 가져다 쓴다.

/**
 * 마감 있는 할 일을 저장한 직후 한 번 묻는다. 브라우저 권한 거절은 영구적이라,
 * 맥락이 분명한 순간에 앱 안의 안내를 먼저 거친다. 폼 모달의 자식이 아니라
 * App 수준에 두어 모달이 닫힐 때 함께 사라지지 않게 한다.
 */
export const ReminderPromptProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
  const toast = useToast();

  const offerReminders = useCallback(() => {
    if (getPushPermission() !== "default") return;
    if (reminderDefault === "off") return;
    if (isPromptSnoozed(Date.now())) return;
    setIsOpen(true);
  }, [reminderDefault]);

  const value = useMemo(() => ({ offerReminders }), [offerReminders]);
  const label = reminderDefault === "off" ? "" : reminderSettingLabel(reminderDefault);

  const handleConfirm = async () => {
    setIsEnabling(true);
    try {
      const { enablePushOnThisDevice } = await import("../../push/pushClient");
      const result = await enablePushOnThisDevice();
      if (result === "granted") toast.success("알림을 켰어요", `마감 ${label}에 알려드릴게요`);
      else if (result === "denied") toast.info("알림이 차단됐어요", "브라우저 사이트 설정에서 허용할 수 있어요");
    } catch (error) {
      console.error("알림 켜기 실패:", error);
      Sentry.captureException(error);
      toast.error("알림을 켜지 못했어요", "잠시 후 다시 시도해 주세요");
    } finally {
      setIsEnabling(false);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    try {
      localStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now() + PROMPT_SNOOZE_MS));
    } catch {
      // 저장소를 못 쓰면 다음 저장 때 다시 물을 뿐이다.
    }
    setIsOpen(false);
  };

  return (
    <ReminderPromptContext.Provider value={value}>
      {children}
      <ConfirmModal
        isOpen={isOpen}
        title="마감 알림"
        message={`마감 ${label}에 알려드릴까요?`}
        confirmText="켜기"
        cancelText="나중에"
        confirmDisabled={isEnabling}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancel}
      />
    </ReminderPromptContext.Provider>
  );
};

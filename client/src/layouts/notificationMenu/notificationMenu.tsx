import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bell, BellOff } from "lucide-react";
import * as Sentry from "@sentry/react";
import { DEFAULT_REMINDER_SETTING } from "@tododo/core/dist/reminders/index.js";
import {
  REMINDER_SETTING_OPTIONS,
  getPushPermission,
  parseReminderSetting,
  useReminderDefault,
  useSetReminderDefault,
  type PushPermission,
} from "@/features/reminders";
import { useToast } from "@/shared/ui/toast/useToast";
import {
  Wrapper,
  Trigger,
  Panel,
  StatusText,
  EnableButton,
  FieldLabel,
  DefaultSelect,
} from "./notificationMenu.styles";

const STATUS_TEXT: Record<PushPermission, string> = {
  granted: "이 기기에서 마감 알림을 받고 있어요.",
  default: "알림을 켜면 탭을 닫아도 마감 전에 알려드려요.",
  denied: "브라우저에서 알림이 차단돼 있어요. 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요.",
  unsupported: "이 브라우저에서는 알림을 받을 수 없어요.",
};

const NotificationMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<PushPermission>(getPushPermission);
  const [isEnabling, setIsEnabling] = useState(false);
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
  const setDefault = useSetReminderDefault();
  const toast = useToast();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    // 브라우저 설정에서 권한을 바꿨을 수 있으니 열 때마다 다시 읽는다.
    setPermission(getPushPermission());
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  // 패널이 열려도 포커스는 트리거에 남아 있으므로(패널 안으로 옮기지 않는다),
  // Escape 핸들러는 패널이 아니라 Wrapper에 달아야 버블링으로 잡힌다.
  const onWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      close(true);
    }
  };

  const enable = async () => {
    setIsEnabling(true);
    try {
      const { enablePushOnThisDevice } = await import("@/features/reminders/push/pushClient");
      setPermission(await enablePushOnThisDevice());
    } catch (error) {
      console.error("알림 켜기 실패:", error);
      Sentry.captureException(error);
      toast.error("알림을 켜지 못했어요", "잠시 후 다시 시도해 주세요");
    } finally {
      setIsEnabling(false);
    }
  };

  const isActive = permission === "granted" && reminderDefault !== "off";
  const Icon = isActive ? Bell : BellOff;

  return (
    <Wrapper ref={wrapperRef} onKeyDown={onWrapperKeyDown}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label="알림 설정"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <Icon size={18} aria-hidden="true" />
      </Trigger>
      {isOpen && (
        <Panel role="dialog" aria-label="알림 설정">
          <StatusText>{STATUS_TEXT[permission]}</StatusText>
          {permission === "default" && (
            <EnableButton type="button" onClick={() => void enable()} disabled={isEnabling}>
              알림 켜기
            </EnableButton>
          )}
          {permission !== "unsupported" && (
            <>
              <FieldLabel htmlFor="reminder-default">기본 알림</FieldLabel>
              <DefaultSelect
                id="reminder-default"
                value={String(reminderDefault)}
                onChange={(e) => {
                  const setting = parseReminderSetting(e.target.value);
                  if (setting === null) return;
                  setDefault.mutate(setting, {
                    onError: (error) => {
                      Sentry.captureException(error);
                      toast.error("저장하지 못했어요", "잠시 후 다시 시도해 주세요");
                    },
                  });
                }}
              >
                {REMINDER_SETTING_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </DefaultSelect>
            </>
          )}
        </Panel>
      )}
    </Wrapper>
  );
};

export default NotificationMenu;

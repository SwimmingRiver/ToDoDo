import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff } from "lucide-react";
import * as Sentry from "@sentry/react";
import { DEFAULT_REMINDER_SETTING } from "@tododo/core/dist/reminders/index.js";
import {
  REMINDER_SETTING_OPTIONS,
  getPushPermission,
  parseReminderSetting,
  useReminderDefault,
  useReminderHistory,
  useMarkHistorySeen,
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
  TriggerSlot,
  Badge,
  Divider,
} from "./notificationMenu.styles";
import NotificationHistoryList from "./notificationHistoryList";

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
  const navigate = useNavigate();
  const history = useReminderHistory();
  const markSeen = useMarkHistorySeen();
  // ●는 "열 때" 기준으로 고정한다. 읽음 처리로 lastSeenAt이 바로 올라가도 열려 있는 동안
  // 무엇이 새 알림이었는지 보이게 하려는 것이다(배지는 즉시 0).
  const [openedLastSeenAt, setOpenedLastSeenAt] = useState(0);
  // 열 때의 재조회가 끝났는지. useMarkHistorySeen.onMutate가 cancelQueries를 하므로
  // 재조회가 끝나기 전에 읽음 처리하면 방금 시작한 재조회가 취소된다.
  const [openSynced, setOpenSynced] = useState(false);
  // 열 때마다 증가하는 번호. 닫힘·언마운트·재오픈 뒤 늦게 끝난 재조회가 상태를 건드리지 않게 한다.
  const openSeqRef = useRef(0);
  // 이번에 연 동안 이미 시도한 가장 큰 seenUntil. 실패 롤백으로 effect가 재실행돼도 무한 재시도하지 않는다.
  const attemptedSeenRef = useRef(0);
  const newestSentAt = history.data?.items[0]?.sentAt ?? 0;
  const lastSeenAt = history.data?.lastSeenAt ?? 0;

  useEffect(() => () => void (openSeqRef.current += 1), []);

  const close = (restoreFocus: boolean) => {
    openSeqRef.current += 1;
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

  // 화면에 보여준 가장 최신 항목까지 읽음 처리한다. 열린 채 새 알림이 와도 따라 올라간다.
  useEffect(() => {
    if (!isOpen || !openSynced) return;
    if (newestSentAt <= lastSeenAt || newestSentAt <= attemptedSeenRef.current) return;
    attemptedSeenRef.current = newestSentAt;
    markSeen.mutate(newestSentAt);
    // markSeen 객체 정체성은 렌더마다 바뀌므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, openSynced, newestSentAt, lastSeenAt]);

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

  const toggle = () => {
    if (isOpen) {
      openSeqRef.current += 1;
      setIsOpen(false);
      return;
    }
    // 캐시 기준으로 먼저 잡고, 재조회가 끝나면 더 오래된(작은) 값으로 보정한다.
    setOpenedLastSeenAt(lastSeenAt);
    // 포그라운드 재조회는 지연되고 백그라운드 탭은 포커스 전엔 갱신이 없으니, 열 때 한 번 더 확인한다.
    attemptedSeenRef.current = 0;
    setOpenSynced(false);
    const seq = ++openSeqRef.current;
    const hadCache = history.data !== undefined;
    const synced = (refetchedLastSeenAt?: number) => {
      if (openSeqRef.current !== seq) return;
      // 열 때 캐시가 오래됐을 수 있으니, 재조회로 받은 lastSeenAt이 더 작으면 그 기준으로 ●를 표시한다.
      // 캐시가 없었으면 받은 값을 그대로 쓴다.
      if (refetchedLastSeenAt !== undefined) {
        setOpenedLastSeenAt((cur) => (hadCache ? Math.min(cur, refetchedLastSeenAt) : refetchedLastSeenAt));
      }
      setOpenSynced(true);
    };
    // 성공·실패 모두 "끝남"으로 취급한다(실패해도 캐시된 기록은 화면에 보이므로 읽음 처리한다).
    void Promise.resolve(history.refetch()).then(
      (result) => synced(result?.data?.lastSeenAt),
      () => synced(),
    );
    setIsOpen(true);
  };

  const openTodo = (todoId: string) => {
    openSeqRef.current += 1;
    setIsOpen(false);
    navigate(`/todo/${encodeURIComponent(todoId)}`);
  };

  const unread = history.unreadCount;
  const triggerLabel = unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : "알림";

  const isActive = permission === "granted" && reminderDefault !== "off";
  const Icon = isActive ? Bell : BellOff;

  return (
    <Wrapper ref={wrapperRef} onKeyDown={onWrapperKeyDown}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <TriggerSlot>
          <Icon size={18} aria-hidden="true" />
          {unread > 0 && <Badge aria-hidden="true">{unread > 9 ? "9+" : unread}</Badge>}
        </TriggerSlot>
      </Trigger>
      {isOpen && (
        <Panel role="dialog" aria-label="알림">
          <NotificationHistoryList
            items={history.data?.items}
            isPending={history.isPending}
            isError={history.isError}
            unreadAfter={openedLastSeenAt}
            now={Date.now()}
            onSelect={openTodo}
          />
          <Divider />
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

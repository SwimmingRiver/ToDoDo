import { useState } from "react";
import { useToast } from "@/shared";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import { useIsPremium, useUpgradeInterest, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
} from "../hooks";
import { auth } from "@/shared/lib/firebase";
import { loadSnapshot, findOrphanGoogleEventIds } from "../hooks/syncSnapshot";
import { Wrapper, ConnectButton, DisconnectButton, RevokedNotice } from "./calendarConnectionButton.styles";

const CalendarConnectionButton = () => {
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const { data: integration } = useCalendarIntegrationStatus();
  const { connect } = useConnectCalendar();
  const { disconnect } = useDisconnectCalendar();
  const { data: todos } = useGetTodos();
  const { submitInterest } = useUpgradeInterest("구글 캘린더 연동 기능");
  const toast = useToast();
  const [isPending, setIsPending] = useState(false);

  const handleConnect = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await connect();
      // 성공 시 connect()가 window.location.href로 페이지를 이동시키므로
      // setIsPending(false)를 여기서 호출할 필요가 없다(언마운트됨).
    } catch (error) {
      console.error("구글 캘린더 연동 시작 실패:", error);
      toast.error("연동 실패", "구글 캘린더 연동을 시작하지 못했습니다. 잠시 후 다시 시도해주세요");
      setIsPending(false);
    }
  };

  const handleDisconnect = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      const todosWithEvent = (todos ?? [])
        .filter((t: Todo): t is Todo & { googleEventId: string } => !!t.googleEventId)
        .map((t) => ({ id: t.id, googleEventId: t.googleEventId }));
      // Todo는 지워졌는데 이벤트 삭제가 실패해 스냅샷에만 남은 고아 이벤트도 같이
      // 보낸다 — 해제 후 스냅샷이 비워지면 이 기록은 영영 사라지기 때문이다.
      const uid = auth.currentUser?.uid;
      const orphanGoogleEventIds = uid
        ? findOrphanGoogleEventIds(loadSnapshot(uid), todosWithEvent.map((t) => t.googleEventId))
        : [];
      const { allDeleted } = await disconnect(todosWithEvent, orphanGoogleEventIds);
      if (allDeleted) {
        toast.success("연동 해제 완료", "구글 캘린더 연동이 해제되었습니다");
      } else {
        toast.error(
          "일부 이벤트가 남아있습니다",
          "연동은 해제됐지만 일부 이벤트가 구글 캘린더에 그대로 남아있을 수 있습니다. 직접 삭제해주세요",
        );
      }
    } catch (error) {
      console.error("구글 캘린더 연동 해제 실패:", error);
      toast.error("연동 해제 실패", "잠시 후 다시 시도해주세요");
    } finally {
      setIsPending(false);
    }
  };

  const unlockedContent = !integration?.connected ? (
    <Wrapper>
      <ConnectButton onClick={handleConnect} disabled={isPending}>
        구글 캘린더 연동
      </ConnectButton>
    </Wrapper>
  ) : (
    <Wrapper>
      {integration.status === "revoked" && (
        <RevokedNotice>연동이 끊겼습니다. 다시 연결해주세요</RevokedNotice>
      )}
      <DisconnectButton onClick={handleDisconnect} disabled={isPending}>
        연동 해제
      </DisconnectButton>
    </Wrapper>
  );

  return (
    <PremiumGate
      isPremium={isPremium}
      isLoading={isEntitlementLoading}
      fallback={
        <Wrapper>
          <PremiumLockedNotice
            compact
            title="구글 캘린더 연동 (프리미엄)"
            description="할 일을 구글 캘린더와 양방향으로 동기화하려면 프리미엄 구독이 필요합니다"
            ctaLabel="관심 있어요"
            onCtaClick={submitInterest}
          />
        </Wrapper>
      }
    >
      {unlockedContent}
    </PremiumGate>
  );
};

export default CalendarConnectionButton;

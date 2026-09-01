import { useState } from "react";
import { useToast } from "@/shared";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
} from "../hooks";
import { Wrapper, ConnectButton, DisconnectButton, RevokedNotice } from "./calendarConnectionButton.styles";

const CalendarConnectionButton = () => {
  const { data: integration } = useCalendarIntegrationStatus();
  const { connect } = useConnectCalendar();
  const { disconnect } = useDisconnectCalendar();
  const { data: todos } = useGetTodos();
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
      const googleEventIds = (todos ?? [])
        .map((t: Todo) => t.googleEventId)
        .filter((id): id is string => !!id);
      await disconnect(googleEventIds);
    } catch (error) {
      console.error("구글 캘린더 연동 해제 실패:", error);
      toast.error("연동 해제 실패", "잠시 후 다시 시도해주세요");
    } finally {
      setIsPending(false);
    }
  };

  if (!integration?.connected) {
    return (
      <Wrapper>
        <ConnectButton onClick={handleConnect} disabled={isPending}>
          구글 캘린더 연동
        </ConnectButton>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {integration.status === "revoked" && (
        <RevokedNotice>연동이 끊겼습니다. 다시 연결해주세요</RevokedNotice>
      )}
      <DisconnectButton onClick={handleDisconnect} disabled={isPending}>
        연동 해제
      </DisconnectButton>
    </Wrapper>
  );
};

export default CalendarConnectionButton;

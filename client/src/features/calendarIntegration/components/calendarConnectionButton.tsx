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

  const handleDisconnect = () => {
    const googleEventIds = (todos ?? [])
      .map((t: Todo) => t.googleEventId)
      .filter((id): id is string => !!id);
    disconnect(googleEventIds);
  };

  if (!integration?.connected) {
    return (
      <Wrapper>
        <ConnectButton onClick={() => connect()}>구글 캘린더 연동</ConnectButton>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {integration.status === "revoked" && (
        <RevokedNotice>연동이 끊겼습니다. 다시 연결해주세요</RevokedNotice>
      )}
      <DisconnectButton onClick={handleDisconnect}>연동 해제</DisconnectButton>
    </Wrapper>
  );
};

export default CalendarConnectionButton;

import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import { formatTimeAgo, type ReminderHistoryItem } from "@/features/reminders";
import {
  Heading,
  List,
  ItemButton,
  UnreadDot,
  Title,
  Meta,
  Message,
  VisuallyHidden,
} from "./notificationHistoryList.styles";

interface Props {
  items: ReminderHistoryItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  /** 이 시각보다 늦게 온 항목이 "읽지 않음". 패널을 연 순간의 lastSeenAt이다. */
  unreadAfter: number;
  now: number;
  onSelect: (todoId: string) => void;
}

const Body = ({ items, isPending, isError, unreadAfter, now, onSelect }: Props) => {
  if (isError) return <Message>알림 기록을 불러오지 못했어요</Message>;
  if (isPending || !items) return <Message>불러오는 중…</Message>;
  if (items.length === 0) return <Message>최근 7일간 받은 알림이 없어요</Message>;
  return (
    <List>
      {items.map((item) => {
        const unread = item.sentAt > unreadAfter;
        return (
          <li key={`${item.todoId}:${item.sentAt}`}>
            <ItemButton type="button" onClick={() => onSelect(item.todoId)}>
              <UnreadDot $visible={unread} aria-hidden="true" />
              <span>
                {unread && <VisuallyHidden>읽지 않음, </VisuallyHidden>}
                <Title>{item.title}</Title>
                <Meta>
                  {reminderBody(item.offsetMinutes)} · {formatTimeAgo(item.sentAt, now)}
                </Meta>
              </span>
            </ItemButton>
          </li>
        );
      })}
    </List>
  );
};

const NotificationHistoryList = (props: Props) => (
  <>
    <Heading>알림</Heading>
    <Body {...props} />
  </>
);

export default NotificationHistoryList;

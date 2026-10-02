import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import { formatTimeAgo, type ReminderHistoryItem } from "@/features/reminders";
import {
  Heading,
  List,
  Row,
  ItemButton,
  UnreadDot,
  Title,
  Meta,
  Message,
  VisuallyHidden,
  TextBlock,
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
  // 재조회가 실패해도 캐시된 기록이 있으면 보여준다. 화면에 보인 항목만 읽음 처리되므로
  // (notificationMenu) 숨기면서 읽음 처리하는 일이 없어야 한다.
  // 보여줄 기록이 없으면 실패여도 빈 상태로 안내한다 — 사용자에겐 "볼 알림이 없다"는 같은 뜻이고,
  // 실패 자체는 useReminderHistory가 Sentry로 보낸다.
  if (!isError && (isPending || !items)) return <Message>불러오는 중…</Message>;
  if (!items?.length) return <Message>최근 7일간 받은 알림이 없어요</Message>;
  return (
    <List>
      {items.map((item) => {
        const unread = item.sentAt > unreadAfter;
        return (
          <Row key={`${item.todoId}:${item.sentAt}`}>
            <ItemButton type="button" onClick={() => onSelect(item.todoId)}>
              <UnreadDot $visible={unread} aria-hidden="true" />
              <TextBlock>
                {unread && <VisuallyHidden>읽지 않음, </VisuallyHidden>}
                <Title>{item.title}</Title>
                <Meta>
                  {reminderBody(item.offsetMinutes)} · {formatTimeAgo(item.sentAt, now)}
                </Meta>
              </TextBlock>
            </ItemButton>
          </Row>
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

import { FEEDBACK_STATUS_LABEL, type FeedbackItem, type FeedbackStatus } from "../api";
import { useUpdateFeedbackStatus } from "../hooks/useUpdateFeedbackStatus";
import { Card, Meta, Content, StatusSelect, ErrorText } from "./feedbackAdminItem.styles";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 문자열을 로컬 시각 yyyy.MM.dd HH:mm으로 바꾼다. */
const formatCreatedAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUSES = Object.keys(FEEDBACK_STATUS_LABEL) as FeedbackStatus[];

const FeedbackAdminItem = ({ item }: { item: FeedbackItem }) => {
  const { mutate, isPending, isError } = useUpdateFeedbackStatus();
  return (
    <Card>
      <Meta>
        <span>{formatCreatedAt(item.createdAt)}</span>
        <span>{item.platform}</span>
        <span>{item.email ?? "이메일 없음"}</span>
      </Meta>
      <Content>{item.content}</Content>
      <StatusSelect
        aria-label="상태"
        value={item.status}
        disabled={isPending}
        onChange={(e) => mutate({ id: item.id, status: e.target.value as FeedbackStatus })}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {FEEDBACK_STATUS_LABEL[s]}
          </option>
        ))}
      </StatusSelect>
      {isError && <ErrorText role="alert">상태를 바꾸지 못했습니다</ErrorText>}
    </Card>
  );
};

export default FeedbackAdminItem;

import { Check, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Todo } from "@/features/todo/types";
import { RecurrenceBadge } from "@/shared";
import { getDaysLeft, getDueBadgeLabel } from "@/shared/utils/due";
import { formatDueTime } from "@/shared/utils/formatToday";
import {
  Row,
  Checkbox,
  Content,
  TitleRow,
  Title,
  Description,
  TimeLabel,
  OverdueBadge,
  DeleteButton,
} from "./todayTodoItem.styles";

interface TodayTodoItemProps {
  todo: Todo;
  onToggleDone: (todo: Todo) => void;
  /** 기본값: 기존처럼 navigate(`/todo/${todo.id}`). 상세 라우트가 없는 컨텍스트(게스트 등)에서 오버라이드용. */
  onItemClick?: (todo: Todo) => void;
  /** 전달된 경우에만 우측 삭제 아이콘(44px 터치 타겟) 노출. 기존 호출부는 미전달 → 기존 동작 100% 유지. */
  onDelete?: (todo: Todo) => void;
}

const TodayTodoItem = ({
  todo,
  onToggleDone,
  onItemClick,
  onDelete,
}: TodayTodoItemProps) => {
  const navigate = useNavigate();
  const isDone = todo.status === "done";
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const isOverdue = !isDone && daysLeft !== null && daysLeft < 0;
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;

  const handleItemClick = () =>
    onItemClick ? onItemClick(todo) : navigate(`/todo/${todo.id}`);

  return (
    <Row>
      <Checkbox
        role="checkbox"
        aria-checked={isDone}
        aria-label={`${todo.title} 완료 처리`}
        $isDone={isDone}
        $isDanger={isOverdue}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(todo);
        }}
      >
        {isDone && <Check size={12} color="#FFFFFF" />}
      </Checkbox>
      <Content onClick={handleItemClick}>
        <TitleRow>
          <Title $isDone={isDone}>{todo.title}</Title>
          {todo.recurrenceId != null && <RecurrenceBadge compact />}
        </TitleRow>
        {todo.description && <Description>{todo.description}</Description>}
      </Content>
      {!isDone && isOverdue && daysLeft !== null ? (
        <OverdueBadge>{getDueBadgeLabel(daysLeft)}</OverdueBadge>
      ) : (
        !isDone && dueTime && <TimeLabel>{dueTime}</TimeLabel>
      )}
      {onDelete && (
        <DeleteButton
          type="button"
          aria-label={`${todo.title} 삭제`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo);
          }}
        >
          <Trash2 size={16} />
        </DeleteButton>
      )}
    </Row>
  );
};

export default TodayTodoItem;

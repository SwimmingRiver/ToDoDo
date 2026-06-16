import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Todo } from "@/features/todo/types";
import { getDaysLeft, getDueBadgeLabel } from "@/shared/utils/due";
import { formatDueTime } from "@/shared/utils/formatToday";
import {
  Row,
  Checkbox,
  Content,
  Title,
  Description,
  TimeLabel,
  OverdueBadge,
} from "./todayTodoItem.styles";

interface TodayTodoItemProps {
  todo: Todo;
  onToggleDone: (todo: Todo) => void;
}

const TodayTodoItem = ({ todo, onToggleDone }: TodayTodoItemProps) => {
  const navigate = useNavigate();
  const isDone = todo.status === "done";
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const isOverdue = !isDone && daysLeft !== null && daysLeft < 0;
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;

  const handleItemClick = () => navigate(`/todo/${todo.id}`);

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
        <Title $isDone={isDone}>{todo.title}</Title>
        {todo.description && <Description>{todo.description}</Description>}
      </Content>
      {!isDone && isOverdue && daysLeft !== null ? (
        <OverdueBadge>{getDueBadgeLabel(daysLeft)}</OverdueBadge>
      ) : (
        !isDone && dueTime && <TimeLabel>{dueTime}</TimeLabel>
      )}
    </Row>
  );
};

export default TodayTodoItem;

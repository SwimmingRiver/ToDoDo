import { useMemo } from "react";
import type { Todo } from "@/features/todo/types";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { DueBadge } from "./todoListItem/todoListItem.styles";
import { DUE_SOON_DAYS, getDaysLeft, getDueBadgeLabel } from "@/shared/utils";

export default function DueTodo({ todos }: { todos: Todo[] }) {
  const navigate = useNavigate();

  const dueSoonTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (!todo.dueAt || todo.status === "done") return false;
        return getDaysLeft(todo.dueAt) <= DUE_SOON_DAYS;
      }),
    [todos],
  );

  return (
    <Container>
      <Header>
        <Clock size={15} />
        마감 임박
      </Header>
      {dueSoonTodos.length === 0 ? (
        <Empty>3일 내 마감 예정이 없습니다</Empty>
      ) : (
        <List>
          {dueSoonTodos.map((todo) => {
            const daysLeft = getDaysLeft(todo.dueAt!);
            return (
              <Item
                key={todo.id}
                $daysLeft={daysLeft}
                onClick={() => navigate(`/todo/${todo.id}`)}
              >
                <Title>{todo.title}</Title>
                <DueBadge $daysLeft={daysLeft}>
                  {getDueBadgeLabel(daysLeft)}
                </DueBadge>
              </Item>
            );
          })}
        </List>
      )}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  width: 100%;
`;

const Header = styled.h3`
  margin: 0 0 4px 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Item = styled.li<{ $daysLeft: number }>`
  border: 1px solid #e0e0e0;
  border-left: 4px solid
    ${({ $daysLeft }) =>
      $daysLeft < 0 ? "#ef4444" : $daysLeft === 0 ? "#f97316" : "#f59e0b"};
  padding: 10px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  &:hover {
    background-color: #f0f0f0;
  }
`;

const Title = styled.span`
  flex: 1;
  font-size: 13px;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Empty = styled.p`
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
  text-align: center;
  padding-top: 12px;
`;

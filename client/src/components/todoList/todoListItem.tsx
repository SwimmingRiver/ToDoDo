import type { Todo } from "../../types/todo.type";
import { styled } from "styled-components";
import { useState } from "react";
import { useTodo } from "./queries";
const TodoListItemContainer = styled.div<{ isChild?: boolean }>`
  border: 1px solid #e0e0e0;
  padding: 10px;
  padding-left: ${(props) => (props.isChild ? "32px" : "10px")};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  &:hover {
    background-color: #f0f0f0;
  }
`;

const ExpandButton = styled.button<{ isExpanded: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  transition: all 0.2s ease;

  &:hover {
    background-color: #e9ecef;
    color: #333;
  }

  &::before {
    content: "${(props) => (props.isExpanded ? "▼" : "▶")}";
    margin-right: 4px;
  }
`;

const TodoListItem = ({
  todo,
  isChild,
  childTodos,
  onEdit,
}: {
  todo: Todo;
  isChild?: boolean;
  childTodos?: Todo[];
  onEdit?: (todo: Todo) => void;
}) => {
  const [isMore, setIsMore] = useState(false);
  const { useDeleteTodo, useUpdateToDone } = useTodo();

  const handleDelete = () => {
    useDeleteTodo.mutate(todo.id);
  };
  const handleUpdateToDone = () => {
    useUpdateToDone.mutate(todo.id);
  };
  return (
    <>
      <TodoListItemContainer key={todo.id} isChild={isChild}>
        <input
          type="checkbox"
          checked={todo.status === "done"}
          onChange={handleUpdateToDone}
        />
        <span>{todo.title}</span>
        <button onClick={() => onEdit?.(todo)}>Edit</button>
        <button onClick={handleDelete}>Delete</button>
        {childTodos && childTodos.length > 0 && (
          <ExpandButton isExpanded={isMore} onClick={() => setIsMore(!isMore)}>
            {childTodos.length}
          </ExpandButton>
        )}
      </TodoListItemContainer>
      {isMore &&
        childTodos?.map((childTodo) => (
          <TodoListItem
            key={childTodo.id}
            todo={childTodo}
            isChild={true}
            onEdit={onEdit}
          />
        ))}
    </>
  );
};

export default TodoListItem;

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

const AddChildButton = styled.button`
  width: calc(100% - 32px);
  padding: 8px 12px;
  margin-left: 32px;
  margin-top: 4px;
  background-color: #f8f9fa;
  border: 1px dashed #dee2e6;
  border-radius: 8px;
  color: #495057;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: #e9ecef;
    border-color: #adb5bd;
    color: #212529;
  }

  &::before {
    content: "+ ";
    font-weight: bold;
  }
`;

const StatusSelect = styled.select`
  padding: 6px 12px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  background-color: white;
  color: #495057;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #adb5bd;
  }

  &:focus {
    outline: none;
    border-color: #1c72eb;
    box-shadow: 0 0 0 2px rgba(28, 114, 235, 0.1);
  }
`;

const TodoListItem = ({
  todo,
  isChild,
  childTodos,
  onEdit,
  onAddChild,
}: {
  todo: Todo;
  isChild?: boolean;
  childTodos?: Todo[];
  onEdit: (todo: Todo) => void;
  onAddChild?: (parentId: string) => void;
}) => {
  const [isMore, setIsMore] = useState(false);
  const { useDeleteTodo, useUpdateTodo } = useTodo();

  const handleDelete = () => {
    useDeleteTodo.mutate(todo.id);
  };
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    useUpdateTodo.mutate({
      ...todo,
      status: e.target.value as "todo" | "doing" | "done",
    });
  };
  return (
    <>
      <TodoListItemContainer key={todo.id} isChild={isChild}>
        <StatusSelect value={todo.status} onChange={handleStatusChange}>
          <option value="todo">Todo</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
        </StatusSelect>
        <span>{todo.title}</span>
        <button onClick={() => onEdit?.(todo)}>Edit</button>
        <button onClick={handleDelete}>Delete</button>
        {!isChild && (
          <ExpandButton isExpanded={isMore} onClick={() => setIsMore(!isMore)}>
            {childTodos && childTodos.length > 0 ? childTodos.length : ""}
          </ExpandButton>
        )}
      </TodoListItemContainer>
      {isMore && (
        <>
          {childTodos?.map((childTodo) => (
            <TodoListItem
              key={childTodo.id}
              todo={childTodo}
              isChild={true}
              onEdit={onEdit}
              onAddChild={onAddChild}
            />
          ))}
          <AddChildButton onClick={() => onAddChild?.(todo.id)}>
            새 하위 작업 추가
          </AddChildButton>
        </>
      )}
    </>
  );
};

export default TodoListItem;

import type { Todo } from "../../types";

import { useState } from "react";
import { useTodo } from "../../hooks";
import { useNavigate } from "react-router-dom";
import {
  TodoListItemContainer,
  ExpandButton,
  AddChildButton,
  StatusSelect,
  TodoTitle,
} from "./todoListItem.styles";

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
  const navigate = useNavigate();

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
        <TodoTitle onClick={() => navigate(`/todo/${todo.id}`)}>
          {todo.title}
        </TodoTitle>
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

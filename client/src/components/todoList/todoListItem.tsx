import type { Todo } from "../../types/todo.type";
import { styled } from "styled-components";
import { useState } from "react";
const TodoListItemContainer = styled.div<{ isChild?: boolean }>`
  border: 1px solid #e0e0e0;
  padding: 10px;
  padding-left: ${props => props.isChild ? '32px' : '10px'};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  &:hover {
    background-color: #f0f0f0;
  }
`;
const TodoListItem = ({
  todo,
  isChild,
  childTodos,
}: {
  todo: Todo;
  isChild?: boolean;
  childTodos?: Todo[];
}) => {
  const [isMore, setIsMore] = useState(false);

  return (
    <>
      <TodoListItemContainer isChild={isChild}>
        <input type="checkbox" />
        <span>{todo.title}</span>
        {childTodos && childTodos.length > 0 && (
          <button onClick={() => setIsMore(!isMore)}>
            {isMore ? 'collapse' : 'expand'}
          </button>
        )}
      </TodoListItemContainer>
      {isMore && childTodos?.map((childTodo) => (
        <TodoListItem
          key={childTodo.id}
          todo={childTodo}
          isChild={true}
        />
      ))}
    </>
  );
};

export default TodoListItem;

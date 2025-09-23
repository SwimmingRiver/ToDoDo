import type { Todo } from "../../types/todo.type";
import { styled } from "styled-components";
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
  isMore,
  setIsMore,
  isChild,
}: {
  todo: Todo;
  isMore?: boolean;
  setIsMore?: (isMore: boolean) => void;
  isChild?: boolean;
}) => {
  return (
    <TodoListItemContainer isChild={isChild}>
      <input type="checkbox" />
      <span>{todo.title}</span>
      <button onClick={() => setIsMore?.(!isMore)}>more</button>
    </TodoListItemContainer>
  );
};

export default TodoListItem;

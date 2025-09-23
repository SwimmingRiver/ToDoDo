import { styled } from "styled-components";
import TodoListItem from "./todoListItem";
import type { Todo } from "../../types/todo.type";
import { useMemo } from "react";

const TodoListContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const todoTree = useMemo(() => {
    const rootTodos = todos.filter((todo) => todo.parentId === null);
    return rootTodos.map((rootTodo) => {
      return {
        ...rootTodo,
        childTodos: todos.filter((todo) => todo.parentId === rootTodo.id),
      };
    });
  }, [todos]);
  return (
    <TodoListContainer>
      {todoTree.map((todo) => (
        <TodoListItem key={todo.id} todo={todo} childTodos={todo.childTodos} />
      ))}
    </TodoListContainer>
  );
};

export default TodoList;

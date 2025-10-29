import { styled } from "styled-components";
import TodoListItem from "./todoListItem";
import type { Todo } from "../../types/todo.type";
import { useMemo } from "react";
import useModal from "../../hooks/useModal";
import Modal from "../modal";
import TodoForm from "./todoForm";

const TodoListContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const AddButton = styled.button`
  width: 100%;
  height: 40px;
  background-color: #1c72eb;
  color: white;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;
`;

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const { isOpen, setIsOpen } = useModal();
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
      <Modal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        children={<TodoForm />}
        onSubmit={() => {}}
      />
      <AddButton onClick={() => setIsOpen(true)}>+</AddButton>
      {todoTree.map((todo) => (
        <TodoListItem key={todo.id} todo={todo} childTodos={todo.childTodos} />
      ))}
    </TodoListContainer>
  );
};

export default TodoList;

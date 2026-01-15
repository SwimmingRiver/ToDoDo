import TodoListItem from "./todoListItem/todoListItem";
import type { Todo } from "../types";
import { useMemo } from "react";
import React from "react";
import useModal from "@/shared/hooks/useModal";
import Modal from "@/shared/ui/modal/modal";
import TodoForm from "./todoForm/todoForm";
import { TodoListContainer, AddButton, ListWrapper } from "./todoList.styles";
import { Plus, ClipboardList } from "lucide-react";
import { EmptyState } from "@/shared";

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const { isOpen, setIsOpen } = useModal();
  const { isOpen: isEditOpen, setIsOpen: setIsEditOpen } = useModal();
  const { isOpen: isAddChildOpen, setIsOpen: setIsAddChildOpen } = useModal();
  const [editingTodo, setEditingTodo] = React.useState<Todo | null>(null);
  const [parentTodoId, setParentTodoId] = React.useState<string | null>(null);

  const todoTree = useMemo(() => {
    const rootTodos = todos.filter((todo) => todo.parentId === null);
    const activatedTodos = rootTodos.filter((todo) => todo.status !== "done");
    return activatedTodos.map((rootTodo) => {
      return {
        ...rootTodo,
        childTodos: todos.filter((todo) => todo.parentId === rootTodo.id),
      };
    });
  }, [todos]);

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  const handleAddChild = (parentId: string) => {
    setParentTodoId(parentId);
    setIsAddChildOpen(true);
  };

  return (
    <TodoListContainer>
      <Modal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        children={<TodoForm onClose={() => setIsOpen(false)} />}
      />
      <Modal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        children={
          <TodoForm
            todo={editingTodo || undefined}
            onClose={() => setIsEditOpen(false)}
          />
        }
      />
      <Modal
        isOpen={isAddChildOpen}
        setIsOpen={setIsAddChildOpen}
        children={
          <TodoForm
            parentId={parentTodoId || undefined}
            onClose={() => setIsAddChildOpen(false)}
          />
        }
      />
      <AddButton onClick={() => setIsOpen(true)}>
        <Plus size={18} /> 새 할일
      </AddButton>
      <ListWrapper>
        {todoTree.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="할 일이 없습니다"
            description="새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"
            actionLabel="새 할일 추가"
            actionIcon={Plus}
            onAction={() => setIsOpen(true)}
          />
        ) : (
          todoTree.map((todo) => (
            <TodoListItem
              key={todo.id}
              todo={todo}
              childTodos={todo.childTodos}
              onEdit={handleEdit}
              onAddChild={handleAddChild}
            />
          ))
        )}
      </ListWrapper>
    </TodoListContainer>
  );
};

export default TodoList;

import TodoListItem from "./todoListItem/todoListItem";
import type { Todo } from "../types";
import { useMemo, useState, useCallback } from "react";
import React from "react";
import useModal from "@/shared/hooks/useModal";
import Modal from "@/shared/ui/modal/modal";
import TodoForm from "./todoForm/todoForm";
import { TodoListContainer, AddButton, ListWrapper } from "./todoList.styles";
import { Plus, ClipboardList, SearchX } from "lucide-react";
import { EmptyState } from "@/shared";
import { TodoSearch } from "./todoSearch";
import { useSearchTodo } from "../hooks";

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const { isOpen, setIsOpen } = useModal();
  const { isOpen: isEditOpen, setIsOpen: setIsEditOpen } = useModal();
  const { isOpen: isAddChildOpen, setIsOpen: setIsAddChildOpen } = useModal();
  const [editingTodo, setEditingTodo] = React.useState<Todo | null>(null);
  const [parentTodoId, setParentTodoId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: searchResults, isLoading: isSearchLoading } = useSearchTodo(searchQuery);

  const isSearching = searchQuery.length > 0;

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

  // 검색 결과를 트리 구조로 변환
  const searchResultTree = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.map((todo: Todo) => ({
      ...todo,
      childTodos: [],
    }));
  }, [searchResults]);

  const displayTodos = isSearching ? searchResultTree : todoTree;

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  const handleAddChild = (parentId: string) => {
    setParentTodoId(parentId);
    setIsAddChildOpen(true);
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

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

      <TodoSearch
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isLoading={isSearchLoading}
        resultCount={searchResults?.length ?? 0}
        isSearching={isSearching}
      />

      <ListWrapper>
        {displayTodos.length === 0 ? (
          isSearching ? (
            <EmptyState
              icon={SearchX}
              title="검색 결과가 없습니다"
              description={`"${searchQuery}"에 대한 결과를 찾을 수 없습니다`}
              actionLabel="검색 취소"
              onAction={handleClearSearch}
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="할 일이 없습니다"
              description="새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"
              actionLabel="새 할일 추가"
              actionIcon={Plus}
              onAction={() => setIsOpen(true)}
            />
          )
        ) : (
          displayTodos.map((todo) => (
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

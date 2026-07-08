import ProjectCard from "./projectCard";
import ChildTodoCard from "./childTodoCard";
import type { Todo } from "../types";
import type { ProjectCardData } from "../utils/projectUtils";
import {
  getProjectProgress,
  getProjectSubtaskInfo,
  getProjectOverdue,
  collapseRecurringInstances,
} from "../utils/projectUtils";
import { useMemo, useState, useCallback } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import useModal from "@/shared/hooks/useModal";
import Modal from "@/shared/ui/modal/modal";
import TodoForm from "./todoForm/todoForm";
import { useTodo } from "../hooks";
import {
  TodoListContainer,
  AddButton,
  ListWrapper,
  ProjectListToolbar,
  ProjectCountText,
  NewProjectLink,
} from "./todoList.styles";
import { Plus, ClipboardList, SearchX } from "lucide-react";
import { EmptyState } from "@/shared";
import { TodoSearch } from "./todoSearch";
import { useSearchTodo } from "../hooks";
import { ConfirmModal, useToast } from "@/shared";

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useModal();
  const { isOpen: isEditOpen, setIsOpen: setIsEditOpen } = useModal();
  const { isOpen: isAddChildOpen, setIsOpen: setIsAddChildOpen } = useModal();
  const [editingTodo, setEditingTodo] = React.useState<Todo | null>(null);
  const [parentTodoId, setParentTodoId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(
    null
  );
  const { useDeleteTodo, useDeleteRecurringSeries } = useTodo();
  const toast = useToast();

  const { data: searchResults, isLoading: isSearchLoading } =
    useSearchTodo(searchQuery);

  const isSearching = searchQuery.length > 0;

  const todoTree = useMemo(() => {
    const rootTodos = todos.filter((todo) => todo.parentId === null);

    const activatedTodos = rootTodos.filter((todo) => todo.status !== "done");

    // 반복 할 일은 최대 4주치 인스턴스가 각각 별도 문서로 존재하므로, 이 목록에서는
    // 시리즈당 대표 1건(지난 미완료 우선, 없으면 다음 예정 건)만 카드로 노출한다.
    const collapsedTodos = collapseRecurringInstances(activatedTodos);

    return collapsedTodos.map((rootTodo) => {
      return {
        ...rootTodo,
        childTodos: todos.filter((todo) => todo.parentId === rootTodo.id),
      };
    });
  }, [todos]);

  const searchResultTree = useMemo(() => {
    if (!searchResults) return [];

    // 검색 결과도 목록과 동일한 규칙을 따른다: 루트 할 일은 완료(done) 제외 +
    // 반복 시리즈당 대표 1건으로 축약. 하위 할 일 매치는 그대로 노출한다
    // (반복은 루트에만 존재하고, 완료된 하위 항목도 검색으로는 찾을 수 있어야 한다).
    const rootMatches = searchResults.filter(
      (todo: Todo) => todo.parentId === null && todo.status !== "done"
    );
    const collapsedRootMatches = collapseRecurringInstances(rootMatches);
    const childMatches = searchResults.filter(
      (todo: Todo) => todo.parentId !== null
    );

    return [...collapsedRootMatches, ...childMatches].map((todo: Todo) => ({
      ...todo,
      childTodos: todo.parentId === null
        ? todos.filter((t) => t.parentId === todo.id)
        : [],
    }));
  }, [searchResults, todos]);

  const displayTodos = isSearching ? searchResultTree : todoTree;

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleToggleExpand = (id: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCardClick = (todo: Todo) => {
    navigate(`/todo/${todo.id}`);
  };

  const handleDeleteProject = (id: string) => {
    setDeleteTargetId(id);
  };

  const handleAddChild = (parentId: string) => {
    setParentTodoId(parentId);
    setIsAddChildOpen(true);
  };

  const projectCards = useMemo<ProjectCardData[]>(() => {
    return todoTree.map((rootTodo) => ({
      todo: rootTodo,
      childTodos: rootTodo.childTodos,
      progress: getProjectProgress(todos, rootTodo.id),
      subtaskInfo: getProjectSubtaskInfo(todos, rootTodo.id),
      overdueInfo: getProjectOverdue(todos, rootTodo.id),
      isExpanded: expandedProjectIds.has(rootTodo.id),
    }));
  }, [todoTree, todos, expandedProjectIds]);

  const deleteTargetTodo = deleteTargetId
    ? todos.find((t) => t.id === deleteTargetId)
    : null;

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
      <ConfirmModal
        isOpen={deleteTargetId !== null}
        title="프로젝트 삭제"
        message={
          deleteTargetTodo?.recurrenceId
            ? `"${deleteTargetTodo?.title ?? ""}"은(는) 반복 일정입니다.\n\n삭제하면 이 반복 시리즈의 모든 일정이 함께 삭제됩니다.`
            : `"${deleteTargetTodo?.title ?? ""}"을(를) 삭제하시겠습니까?`
        }
        confirmText="삭제"
        cancelText="취소"
        onConfirm={() => {
          if (deleteTargetId) {
            const title = deleteTargetTodo?.title ?? "";
            if (deleteTargetTodo?.recurrenceId) {
              useDeleteRecurringSeries.mutate(deleteTargetTodo.recurrenceId, {
                onSuccess: () => toast.success("삭제 완료", `"${title}" 반복 일정이 모두 삭제되었습니다`),
                onError: () => toast.error("삭제 실패", "삭제 중 오류가 발생했습니다"),
              });
            } else {
              useDeleteTodo.mutate(deleteTargetId, {
                onSuccess: () => toast.success("삭제 완료", `"${title}" 프로젝트가 삭제되었습니다`),
                onError: () => toast.error("삭제 실패", "삭제 중 오류가 발생했습니다"),
              });
            }
          }
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
      <Modal
        isOpen={isAddChildOpen}
        setIsOpen={setIsAddChildOpen}
        children={
          <TodoForm
            parentId={parentTodoId ?? undefined}
            onClose={() => { setIsAddChildOpen(false); setParentTodoId(null); }}
          />
        }
      />

      <TodoSearch
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isLoading={isSearchLoading}
        resultCount={searchResults?.length ?? 0}
        isSearching={isSearching}
      />

      <ListWrapper>
        {isSearching ? (
          displayTodos.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="검색 결과가 없습니다"
              description={`"${searchQuery}"에 대한 결과를 찾을 수 없습니다`}
              actionLabel="검색 취소"
              onAction={handleClearSearch}
            />
          ) : (
            displayTodos.map((todo) => {
              if (todo.parentId === null) {
                const projectData: ProjectCardData = {
                  todo,
                  childTodos: todo.childTodos,
                  progress: getProjectProgress(todos, todo.id),
                  subtaskInfo: getProjectSubtaskInfo(todos, todo.id),
                  overdueInfo: getProjectOverdue(todos, todo.id),
                  isExpanded: expandedProjectIds.has(todo.id),
                };
                return (
                  <ProjectCard
                    key={todo.id}
                    data={projectData}
                    onCardClick={handleCardClick}
                    onToggleExpand={handleToggleExpand}
                    onEdit={handleEdit}
                    onDelete={handleDeleteProject}
                    onAddChild={handleAddChild}
                  />
                );
              }
              return (
                <ChildTodoCard
                  key={todo.id}
                  todo={todo}
                  onEdit={handleEdit}
                />
              );
            })
          )
        ) : projectCards.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="할 일이 없습니다"
            description="새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"
            actionLabel="새 할일 추가"
            actionIcon={Plus}
            onAction={() => setIsOpen(true)}
          />
        ) : (
          <>
            <ProjectListToolbar>
              <ProjectCountText>
                프로젝트 {projectCards.length}개
              </ProjectCountText>
              <NewProjectLink
                onClick={() => setIsOpen(true)}
                aria-label="새 프로젝트 추가"
              >
                <Plus size={14} />
                새 프로젝트
              </NewProjectLink>
            </ProjectListToolbar>
            {projectCards.map((card) => (
              <ProjectCard
                key={card.todo.id}
                data={card}
                onCardClick={handleCardClick}
                onToggleExpand={handleToggleExpand}
                onEdit={handleEdit}
                onDelete={handleDeleteProject}
                onAddChild={handleAddChild}
              />
            ))}
          </>
        )}
      </ListWrapper>

      <AddButton onClick={() => setIsOpen(true)}>
        <Plus size={16} />
        새 할일
      </AddButton>
    </TodoListContainer>
  );
};

export default TodoList;

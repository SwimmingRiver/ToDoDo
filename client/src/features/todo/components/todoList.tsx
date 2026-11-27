import ProjectCard from "./projectCard";
import type { Todo } from "../types";
import type { ProjectCardData } from "../utils/projectUtils";
import {
  getProjectProgress,
  getProjectSubtaskInfo,
  getProjectOverdue,
  getRecurringMissedCount,
} from "../utils/projectUtils";
import { buildActiveSearchResult } from "../utils/activeSearch";
import { isTodoFilterActive, type TodoFilter } from "@tododo/core/dist/todoFilter/index.js";
import { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import useModal from "@/shared/hooks/useModal";
import Modal from "@/shared/ui/modal/modal";
import TodoForm from "./todoForm/todoForm";
import { useDeleteTodo, useDeleteRecurringSeries, useTodoFilterParams } from "../hooks";
import {
  TodoListContainer,
  AddButton,
  AddButtonRow,
  AiPlanButton,
  ListWrapper,
  ProjectListToolbar,
  ProjectCountText,
  NewProjectLink,
} from "./todoList.styles";
import { Plus, ClipboardList, SearchX, Sparkles } from "lucide-react";
import { EmptyState } from "@/shared";
import { TodoSearch } from "./todoSearch";
import { PriorityFilterChips } from "./priorityFilterChips";
import { ConfirmModal, useToast } from "@/shared";

const EMPTY_IDS: ReadonlySet<string> = new Set();

// 모달은 버튼을 눌러야 필요하므로 초기 번들에 넣지 않는다.
const AiPlanModal = lazy(() => import("@/features/aiPlan/components/aiPlanModal"));

const TodoList = ({ todos }: { todos: Todo[] }) => {
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useModal();
  const { isOpen: isEditOpen, setIsOpen: setIsEditOpen } = useModal();
  const { isOpen: isAddChildOpen, setIsOpen: setIsAddChildOpen } = useModal();
  const [isAiPlanOpen, setIsAiPlanOpen] = useState(false);
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isAddChildSubmitting, setIsAddChildSubmitting] = useState(false);
  const [editingTodo, setEditingTodo] = React.useState<Todo | null>(null);
  const [parentTodoId, setParentTodoId] = React.useState<string | null>(null);
  const { filter, setQuery, togglePriority } = useTodoFilterParams();
  // 검색 칸은 내부 입력값을 들고 있으므로, 바깥(빈 상태의 "검색 취소")에서 지울 때는
  // key를 바꿔 빈 값으로 다시 마운트한다. 이때 initialValue를 filter.query로 주면 안 된다:
  // react-router는 URL 갱신을 startTransition으로 적용하므로 key 변경(긴급 업데이트)이
  // 먼저 렌더돼 옛 q로 다시 마운트되고, 디바운스가 그 검색어를 되살린다. 그래서 다시
  // 마운트한 뒤(key > 0)에는 항상 빈 값으로 시작한다 — URL q로 입력을 채우는 건 첫
  // 마운트(상세 → 뒤로 가기 복원)뿐이다.
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(
    null
  );
  const deleteTodo = useDeleteTodo();
  const deleteRecurringSeries = useDeleteRecurringSeries();
  const toast = useToast();

  const isFiltering = isTodoFilterActive(filter);

  // 검색·우선순위 필터는 이미 받아온 todos를 거른다(Firestore를 다시 읽지 않음).
  // 필터가 꺼져 있으면 roots는 지금 목록 규칙(루트·미완료·반복 시리즈당 대표 1건) 그대로다.
  const { roots, matchedChildIds, autoExpandIds } = useMemo(
    () => buildActiveSearchResult(todos, filter),
    [todos, filter]
  );

  const todoTree = useMemo(() => {
    return roots.map((rootTodo) => {
      return {
        ...rootTodo,
        childTodos: todos.filter((todo) => todo.parentId === rootTodo.id),
      };
    });
  }, [roots, todos]);

  // 하위만 걸려 자동으로 펼친 카드를 사용자가 접은 경우. 필터가 바뀌면 무효가 되도록
  // 어느 필터에서 접었는지 함께 기억한다.
  const [collapsedAuto, setCollapsedAuto] = useState<{
    filter: TodoFilter | null;
    ids: ReadonlySet<string>;
  }>({ filter: null, ids: EMPTY_IDS });
  const collapsedAutoIds =
    collapsedAuto.filter === filter ? collapsedAuto.ids : EMPTY_IDS;

  // 토글 핸들러의 참조를 고정하기 위해(ProjectCard memo) 최신 값은 ref로 읽는다.
  const expandContextRef = useRef({ filter, autoExpandIds, collapsedAutoIds });
  useEffect(() => {
    expandContextRef.current = { filter, autoExpandIds, collapsedAutoIds };
  }, [filter, autoExpandIds, collapsedAutoIds]);

  const handleEdit = useCallback((todo: Todo) => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  }, [setIsEditOpen]);

  // TodoSearch는 입력이 비면(마운트 포함) 즉시 onClear를 부른다. URL에 q가 없을 때까지
  // setQuery를 부르면 같은 주소로 replace 내비게이션이 일어나 목록 전체가 한 번 더
  // 렌더되므로, 지울 검색어가 있을 때만 부른다.
  const handleClearQuery = useCallback(() => {
    if (expandContextRef.current.filter.query) setQuery("");
  }, [setQuery]);

  const handleCancelSearch = useCallback(() => {
    setQuery("");
    setSearchInputKey((k) => k + 1);
  }, [setQuery]);

  // 펼침 = 사용자가 직접 펼침 || (검색으로 자동 펼침 && 사용자가 접지 않음).
  // 사용자가 펼친 상태(expandedProjectIds)는 검색과 무관하게 유지되므로, 검색을
  // 지우면 자동 펼침만 사라지고 직접 펼친 카드는 계속 펼쳐져 있다.
  const handleToggleExpand = useCallback((id: string) => {
    const { filter: currentFilter, autoExpandIds: auto, collapsedAutoIds: collapsed } =
      expandContextRef.current;
    const isAutoExpanded = auto.has(id) && !collapsed.has(id);

    setExpandedProjectIds((prev) => {
      const isExpanded = prev.has(id) || isAutoExpanded;
      const next = new Set(prev);
      if (isExpanded) next.delete(id);
      else next.add(id);
      return next;
    });

    if (auto.has(id)) {
      const nextCollapsed = new Set(collapsed);
      if (isAutoExpanded) nextCollapsed.add(id);
      else nextCollapsed.delete(id);
      setCollapsedAuto({ filter: currentFilter, ids: nextCollapsed });
    }
  }, []);

  const isProjectExpanded = (id: string) =>
    expandedProjectIds.has(id) ||
    (autoExpandIds.has(id) && !collapsedAutoIds.has(id));

  const highlightedChildIds = isFiltering ? matchedChildIds : undefined;

  const handleCardClick = useCallback((todo: Todo) => {
    navigate(`/todo/${todo.id}`);
  }, [navigate]);

  const handleDeleteProject = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setParentTodoId(parentId);
    setIsAddChildOpen(true);
  }, [setIsAddChildOpen]);

  // expandedProjectIds는 일부러 의존성에서 뺐다: 카드 하나를 펼쳐도 이 배열
  // 전체가 새로 생성되면 .map()이 바뀌지 않은 프로젝트의 data까지 새 객체로
  // 만들어버려, ProjectCard(memo)가 전부 리렌더된다. isExpanded는 아래에서
  // ProjectCard에 별도 prop으로 넘겨 펼친 카드 하나의 prop만 바뀌게 한다.
  const projectCards = useMemo<ProjectCardData[]>(() => {
    return todoTree.map((rootTodo) => ({
      todo: rootTodo,
      childTodos: rootTodo.childTodos,
      progress: getProjectProgress(todos, rootTodo.id),
      subtaskInfo: getProjectSubtaskInfo(todos, rootTodo.id),
      overdueInfo: getProjectOverdue(todos, rootTodo),
      recurringMissedCount: getRecurringMissedCount(todos, rootTodo),
    }));
  }, [todoTree, todos]);

  const deleteTargetTodo = deleteTargetId
    ? todos.find((t) => t.id === deleteTargetId)
    : null;

  return (
    <TodoListContainer>
      <Modal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        disabled={isAddSubmitting}
        children={
          <TodoForm
            onClose={() => setIsOpen(false)}
            onSubmittingChange={setIsAddSubmitting}
          />
        }
      />
      <Modal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        disabled={isEditSubmitting}
        children={
          <TodoForm
            todo={editingTodo || undefined}
            onClose={() => setIsEditOpen(false)}
            onSubmittingChange={setIsEditSubmitting}
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
              deleteRecurringSeries.mutate(deleteTargetTodo.recurrenceId, {
                onSuccess: () => toast.success("삭제 완료", `"${title}" 반복 일정이 모두 삭제되었습니다`),
                onError: () => toast.error("삭제 실패", "삭제 중 오류가 발생했습니다"),
              });
            } else {
              deleteTodo.mutate(deleteTargetId, {
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
        disabled={isAddChildSubmitting}
        children={
          <TodoForm
            parentId={parentTodoId ?? undefined}
            onClose={() => { setIsAddChildOpen(false); setParentTodoId(null); }}
            onSubmittingChange={setIsAddChildSubmitting}
          />
        }
      />

      <TodoSearch
        key={searchInputKey}
        initialValue={searchInputKey === 0 ? filter.query : ""}
        onSearch={setQuery}
        onClear={handleClearQuery}
        resultCount={projectCards.length}
        isSearching={isFiltering}
      />
      <PriorityFilterChips
        selected={filter.priorities}
        onToggle={togglePriority}
      />

      <ListWrapper>
        {isFiltering && projectCards.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="검색 결과가 없습니다"
            description={
              filter.query.trim()
                ? `"${filter.query.trim()}"에 대한 결과를 찾을 수 없습니다`
                : "조건에 맞는 할 일이 없습니다"
            }
            {...(filter.query.trim()
              ? { actionLabel: "검색 취소", onAction: handleCancelSearch }
              : {})}
          />
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
                isExpanded={isProjectExpanded(card.todo.id)}
                highlightedChildIds={highlightedChildIds}
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

      <AddButtonRow>
        <AddButton onClick={() => setIsOpen(true)}>
          <Plus size={16} />
          새 할일
        </AddButton>
        <AiPlanButton onClick={() => setIsAiPlanOpen(true)}>
          <Sparkles size={16} aria-hidden="true" />
          AI로 계획
        </AiPlanButton>
      </AddButtonRow>
      {isAiPlanOpen && (
        <Suspense fallback={null}>
          <AiPlanModal onClose={() => setIsAiPlanOpen(false)} />
        </Suspense>
      )}
    </TodoListContainer>
  );
};

export default TodoList;

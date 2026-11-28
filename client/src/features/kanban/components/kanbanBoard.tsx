import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { useGetTodos, useUpdateTodo, useReorderTodos, type Todo } from "@/features/todo";
import { useMediaQuery, KanbanSkeleton, EmptyState, useToast } from "@/shared";
import KanbanColumn, { type Status } from "./kanbanColumn";
import { useKanbanDrag } from "../hooks/useKanbanDrag";
import { isVisibleInKanban } from "../utils/kanbanFilters";
import { collapseRecurringInstances } from "@/features/todo";
import { useTodoFilterParams } from "@/features/todo/hooks/useTodoFilterParams";
import { TodoSearch } from "@/features/todo/components/todoSearch";
import { PriorityFilterChips } from "@/features/todo/components/priorityFilterChips";
import { SearchEmptyState } from "@/features/todo/components/searchEmptyState";
import {
  matchesTodoFilter,
  isTodoFilterActive,
} from "@tododo/core/dist/todoFilter/index.js";
import { Circle, Loader, CheckCircle, AlertCircle } from "lucide-react";
import {
  KanbanBoardContainer,
  DragOverlayItem,
  ParentLabel,
  ItemTitle,
  MobileTabContainer,
  MobileTabButton,
  MobileColumnWrapper,
  FilterBar,
  KanbanPageWrapper,
} from "./kanbanBoard.styles";

type KanbanTab = "todo" | "doing" | "done";

const KanbanBoard = () => {
  const navigate = useNavigate();
  const updateTodo = useUpdateTodo();
  const reorderTodos = useReorderTodos();
  const { data: todos, isLoading, isError } = useGetTodos();
  const [activeTab, setActiveTab] = useState<KanbanTab>("todo");
  const isTablet = useMediaQuery("tablet");
  const toast = useToast();
  // 칸반은 목록의 완료 탭(tab)을 쓰지 않는다 — 검색어·우선순위만 사용.
  const { filter, setQuery, togglePriority, resetFilter } = useTodoFilterParams();
  const isFiltering = isTodoFilterActive(filter);

  // TodoSearch의 디바운스 effect는 onClear에 의존하므로 렌더마다 새 함수를 주면 effect가
  // 매번 다시 걸린다. 그래서 useCallback으로 감싸지만, setQuery가 location.search가 바뀔
  // 때마다 새로 만들어지므로(react-router setSearchParams가 searchParams에 묶임) 이 참조도
  // 그때는 바뀐다. 같은 검색어로 setQuery → replace 내비게이션 → 리렌더가 반복되지 않는 건
  // useTodoFilterParams가 주소가 그대로면 내비게이션하지 않기 때문이다. 최신 검색어는
  // ref로 읽는다(목록의 handleClearQuery와 같은 방식).
  const queryRef = useRef(filter.query);
  useEffect(() => {
    queryRef.current = filter.query;
  }, [filter.query]);
  const handleClearQuery = useCallback(() => {
    if (queryRef.current) setQuery("");
  }, [setQuery]);

  // 결과 줄 버튼과 빈 상태 버튼이 함께 쓴다. 빈 상태 버튼은 검색칸 밖이라 입력값을 직접
  // 비울 수 없으므로, key를 바꿔 검색칸을 새로 마운트한다(목록의 handleCancelSearch와 같은 방식).
  const [searchInputKey, setSearchInputKey] = useState(0);
  const handleResetFilter = useCallback(() => {
    resetFilter();
    setSearchInputKey((k) => k + 1);
  }, [resetFilter]);

  const notifyStatusChangeError = () =>
    toast.error("상태 변경 실패", "할 일 상태 변경 중 오류가 발생했습니다");

  const { sensors, activeId, activeTodo, handleDragStart, handleDragEnd } =
    useKanbanDrag({
      todos,
      isReorderLocked: isFiltering,
      onUpdateTodo: (todo) =>
        updateTodo.mutate(todo, { onError: notifyStatusChangeError }),
      onReorderTodos: (updates) =>
        reorderTodos.mutate(updates, {
          onError: () => {
            toast.error("순서 변경 실패", "할 일 순서 변경 중 오류가 발생했습니다");
          },
        }),
    });

  // 반복 인스턴스는 며칠 방치되면 같은 recurrenceId의 인스턴스가 여러 개 노출 조건을
  // 만족할 수 있다(예: 매일 반복을 3일간 열어보지 않은 경우). 시리즈당 대표 1건(가장
  // 이른 dueAt)만 카드로 보여준다 — todoList.tsx와 동일한 원칙.
  const todoList = useMemo(() => {
    const today = new Date();
    return collapseRecurringInstances(
      todos?.filter(
        (todo) =>
          todo.status === "todo" &&
          isVisibleInKanban(todo, today) &&
          matchesTodoFilter(todo, filter),
      ) ?? [],
    );
  }, [todos, filter]);

  const doingList = useMemo(() => {
    const today = new Date();
    return collapseRecurringInstances(
      todos?.filter(
        (todo) =>
          todo.status === "doing" &&
          isVisibleInKanban(todo, today) &&
          matchesTodoFilter(todo, filter),
      ) ?? [],
    );
  }, [todos, filter]);

  const doneList = useMemo(() => {
    const today = new Date();
    return collapseRecurringInstances(
      todos?.filter(
        (todo) =>
          todo.status === "done" &&
          isVisibleInKanban(todo, today) &&
          matchesTodoFilter(todo, filter),
      ) ?? [],
    );
  }, [todos, filter]);

  const filteredCount = todoList.length + doingList.length + doneList.length;

  const handleNavigate = (id: string) => {
    if (!activeId) {
      navigate(`/todo/${id}`);
    }
  };

  // 모바일(태블릿 이하)에서는 활성 탭 컬럼 1개만 DOM에 존재해 dnd-kit 드래그로
  // 다른 상태로 옮길 수 없다. 카드의 "..." 액션시트에서 상태를 선택하면 기존
  // 드래그와 동일한 useUpdateTodo mutation을 재사용해 상태를 변경한다.
  const handleStatusChange = (todo: Todo, status: Status) => {
    if (todo.status === status) return;
    updateTodo.mutate(
      { ...todo, status },
      { onError: notifyStatusChangeError },
    );
  };

  const tabColumnMap: Record<KanbanTab, { title: string; todos: Todo[] }> = {
    todo: { title: "To Do", todos: todoList },
    doing: { title: "Doing", todos: doingList },
    done: { title: "Done", todos: doneList },
  };

  const renderActiveColumn = () => {
    const { title, todos: activeTodos } = tabColumnMap[activeTab];
    return (
      <KanbanColumn
        title={title}
        status={activeTab}
        todos={activeTodos}
        allTodos={todos ?? []}
        onNavigate={handleNavigate}
        isMobile={isTablet}
        onStatusChange={handleStatusChange}
      />
    );
  };

  if (isLoading) {
    return <KanbanSkeleton mobile={isTablet} />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="칸반 보드를 불러오지 못했습니다"
        description="네트워크 연결을 확인하고 다시 시도해주세요"
      />
    );
  }

  return (
    <KanbanPageWrapper>
      <FilterBar>
        <TodoSearch
          key={searchInputKey}
          initialValue={searchInputKey === 0 ? filter.query : ""}
          onSearch={setQuery}
          hasPriorityFilter={filter.priorities.length > 0}
          onClear={handleClearQuery}
          onReset={handleResetFilter}
          resultCount={filteredCount}
          isSearching={isFiltering}
        />
        <PriorityFilterChips
          selected={filter.priorities}
          onToggle={togglePriority}
        />
      </FilterBar>
      {isFiltering && filteredCount === 0 ? (
        <SearchEmptyState
          query={filter.query}
          hasPriorityFilter={filter.priorities.length > 0}
          onCancelSearch={handleResetFilter}
        />
      ) : (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {isTablet ? (
        <>
          <MobileTabContainer>
            <MobileTabButton
              $active={activeTab === "todo"}
              onClick={() => setActiveTab("todo")}
            >
              <Circle size={16} /> To Do ({todoList.length})
            </MobileTabButton>
            <MobileTabButton
              $active={activeTab === "doing"}
              onClick={() => setActiveTab("doing")}
            >
              <Loader size={16} /> Doing ({doingList.length})
            </MobileTabButton>
            <MobileTabButton
              $active={activeTab === "done"}
              onClick={() => setActiveTab("done")}
            >
              <CheckCircle size={16} /> Done ({doneList.length})
            </MobileTabButton>
          </MobileTabContainer>
          <MobileColumnWrapper>{renderActiveColumn()}</MobileColumnWrapper>
        </>
      ) : (
        <KanbanBoardContainer>
          <KanbanColumn
            title="To Do"
            status="todo"
            todos={todoList}
            allTodos={todos ?? []}
            onNavigate={handleNavigate}
          />
          <KanbanColumn
            title="Doing"
            status="doing"
            todos={doingList}
            allTodos={todos ?? []}
            onNavigate={handleNavigate}
          />
          <KanbanColumn
            title="Done"
            status="done"
            todos={doneList}
            allTodos={todos ?? []}
            onNavigate={handleNavigate}
          />
        </KanbanBoardContainer>
      )}
      <DragOverlay>
        {activeTodo ? (
          <DragOverlayItem>
            {activeTodo.parentId && (
              <ParentLabel>
                {todos?.find((t) => t.id === activeTodo.parentId)?.title}
              </ParentLabel>
            )}
            <ItemTitle>{activeTodo.title}</ItemTitle>
          </DragOverlayItem>
        ) : null}
      </DragOverlay>
    </DndContext>
      )}
    </KanbanPageWrapper>
  );
};

export default KanbanBoard;

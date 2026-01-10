import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { useTodo } from "@/features/todo";
import KanbanColumn from "./kanbanColumn";
import { useKanbanDrag } from "../hooks/useKanbanDrag";
import {
  KanbanBoardContainer,
  DragOverlayItem,
  ParentLabel,
  ItemTitle,
} from "./kanbanBoard.styles";

const KanbanBoard = () => {
  const navigate = useNavigate();
  const { useGetTodos, useUpdateTodo } = useTodo();
  const { data: todos } = useGetTodos;

  const { sensors, activeId, activeTodo, handleDragStart, handleDragEnd } =
    useKanbanDrag({
      todos,
      onUpdateTodo: (todo) => useUpdateTodo.mutate(todo),
    });

  const todoList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "todo") ?? [];
  }, [todos]);

  const doingList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "doing") ?? [];
  }, [todos]);

  const doneList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "done") ?? [];
  }, [todos]);

  const handleNavigate = (id: string) => {
    if (!activeId) {
      navigate(`/todo/${id}`);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
  );
};

export default KanbanBoard;

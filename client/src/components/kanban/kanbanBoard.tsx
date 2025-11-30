import { styled } from "styled-components";
import { useTodo } from "../todoList/queries";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Todo } from "../../types/todo.type";

const KanbanBoardContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  gap: 8px;
  padding: 8px;
`;

const KanbanColumn = styled.div`
  width: 100%;
  height: 100%;
  background-color: #f4f5f7;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
`;

const ColumnTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: #5e6c84;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const KanbanItemList = styled.div<{ $isOver?: boolean }>`
  flex: 1;
  min-height: 100px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  background-color: ${({ $isOver }) => ($isOver ? "#e3e6ea" : "transparent")};
`;

const KanbanItemStyled = styled.div<{ $isDragging?: boolean }>`
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  cursor: grab;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.5 : 1)};

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

const ItemTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  color: #172b4d;
  margin: 0;
`;

const DragOverlayItem = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  cursor: grabbing;
`;

type Status = "todo" | "doing" | "done";

interface SortableItemProps {
  todo: Todo;
  onNavigate: (id: string) => void;
}

const SortableItem = ({ todo, onNavigate }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <KanbanItemStyled
      ref={setNodeRef}
      style={style}
      $isDragging={isDragging}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(todo.id)}
    >
      <ItemTitle>{todo.title}</ItemTitle>
    </KanbanItemStyled>
  );
};

interface ColumnProps {
  title: string;
  status: Status;
  todos: Todo[];
  onNavigate: (id: string) => void;
}

const Column = ({ title, status, todos, onNavigate }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <KanbanColumn>
      <ColumnTitle>{title}</ColumnTitle>
      <SortableContext
        items={todos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        id={status}
      >
        <KanbanItemList ref={setNodeRef} $isOver={isOver}>
          {todos.map((todo) => (
            <SortableItem key={todo.id} todo={todo} onNavigate={onNavigate} />
          ))}
        </KanbanItemList>
      </SortableContext>
    </KanbanColumn>
  );
};

const KanbanBoard = () => {
  const navigate = useNavigate();
  const { useGetTodos, useUpdateTodo } = useTodo();
  const { data: todos } = useGetTodos;
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const todoList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "todo") ?? [];
  }, [todos]);

  const doingList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "doing") ?? [];
  }, [todos]);

  const doneList = useMemo(() => {
    return todos?.filter((todo) => todo.status === "done") ?? [];
  }, [todos]);

  const activeTodo = useMemo(() => {
    return todos?.find((todo) => todo.id === activeId);
  }, [todos, activeId]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedTodo = todos?.find((t) => t.id === active.id);
    if (!draggedTodo) return;

    // Determine target status
    let targetStatus: Status | null = null;

    // Check if dropped over another item
    const overTodo = todos?.find((t) => t.id === over.id);
    if (overTodo) {
      targetStatus = overTodo.status;
    } else {
      // Dropped over column
      targetStatus = over.id as Status;
    }

    if (targetStatus && draggedTodo.status !== targetStatus) {
      useUpdateTodo.mutate({
        ...draggedTodo,
        status: targetStatus,
      });
    }
  };

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
        <Column
          title="To Do"
          status="todo"
          todos={todoList}
          onNavigate={handleNavigate}
        />
        <Column
          title="Doing"
          status="doing"
          todos={doingList}
          onNavigate={handleNavigate}
        />
        <Column
          title="Done"
          status="done"
          todos={doneList}
          onNavigate={handleNavigate}
        />
      </KanbanBoardContainer>
      <DragOverlay>
        {activeTodo ? (
          <DragOverlayItem>
            <ItemTitle>{activeTodo.title}</ItemTitle>
          </DragOverlayItem>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default KanbanBoard;

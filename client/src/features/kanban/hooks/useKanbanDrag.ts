import { useState } from "react";
import {
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Todo } from "@/features/todo";
import type { Status } from "../components/kanbanColumn";

interface UseKanbanDragProps {
  todos: Todo[] | undefined;
  onUpdateTodo: (todo: Todo) => void;
}

export const useKanbanDrag = ({ todos, onUpdateTodo }: UseKanbanDragProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeTodo = todos?.find((todo) => todo.id === activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedTodo = todos?.find((t) => t.id === active.id);
    if (!draggedTodo) return;

    let targetStatus: Status | null = null;

    const overTodo = todos?.find((t) => t.id === over.id);
    if (overTodo) {
      targetStatus = overTodo.status;
    } else {
      targetStatus = over.id as Status;
    }

    if (targetStatus && draggedTodo.status !== targetStatus) {
      onUpdateTodo({
        ...draggedTodo,
        status: targetStatus,
      });
    }
  };

  return {
    sensors,
    activeId,
    activeTodo,
    handleDragStart,
    handleDragEnd,
  };
};

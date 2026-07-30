import { useState } from "react";
import {
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  KeyboardCode,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Todo, TodoReorderUpdate } from "@/features/todo";
import type { Status } from "../components/kanbanColumn";

interface UseKanbanDragProps {
  todos: Todo[] | undefined;
  onUpdateTodo: (todo: Todo) => void;
  onReorderTodos: (updates: TodoReorderUpdate[]) => void;
}

export const useKanbanDrag = ({
  todos,
  onUpdateTodo,
  onReorderTodos,
}: UseKanbanDragProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
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

    if (!targetStatus) return;

    if (draggedTodo.status !== targetStatus) {
      onUpdateTodo({
        ...draggedTodo,
        status: targetStatus,
      });
      return;
    }

    // 같은 컬럼(status) 내 재정렬. todos(allTodos, collapse/가시성 필터 적용 전)에서
    // 같은 status를 가진 문서 전체를 order 기준으로 정렬해 기준 배열로 삼는다 —
    // collapseRecurringInstances가 화면에서 숨긴 반복 인스턴스 형제도 여기 포함되므로,
    // 나중에 그 형제가 대표로 떠오르더라도 상대 순서가 어긋나지 않는다.
    const allStatusTodos = (todos ?? [])
      .filter((t) => t.status === draggedTodo.status)
      .sort((a, b) => a.order - b.order);

    const oldIndex = allStatusTodos.findIndex((t) => t.id === draggedTodo.id);
    if (oldIndex === -1) return;

    // overTodo가 없으면 컬럼의 빈 영역(컬럼 자체가 드롭 대상)에 드롭된 것이므로
    // 맨 끝으로 이동한 것으로 간주한다.
    const newIndex = overTodo
      ? allStatusTodos.findIndex((t) => t.id === overTodo.id)
      : allStatusTodos.length - 1;
    if (newIndex === -1) return;

    const reordered = arrayMove(allStatusTodos, oldIndex, newIndex);

    const originalOrderById = new Map(allStatusTodos.map((t) => [t.id, t.order]));
    const updates = reordered
      .map((t, index) => ({ id: t.id, order: index }))
      .filter((u) => originalOrderById.get(u.id) !== u.order);

    if (updates.length > 0) {
      onReorderTodos(updates);
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

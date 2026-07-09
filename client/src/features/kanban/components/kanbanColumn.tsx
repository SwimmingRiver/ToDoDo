import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Todo } from "@/features/todo";
import KanbanItem from "./kanbanItem";
import {
  KanbanColumn as KanbanColumnStyled,
  ColumnTitle,
  KanbanItemList,
  EmptyColumn,
  EmptyIcon,
  EmptyText,
} from "./kanbanBoard.styles";
import { Circle, Loader, CheckCircle } from "lucide-react";

export type Status = "todo" | "doing" | "done";

interface KanbanColumnProps {
  title: string;
  status: Status;
  todos: Todo[];
  allTodos: Todo[];
  onNavigate: (id: string) => void;
  isMobile?: boolean;
  onStatusChange?: (todo: Todo, status: Status) => void;
}

const getEmptyMessage = (status: Status) => {
  switch (status) {
    case "todo":
      return "아직 할 일이 없습니다";
    case "doing":
      return "진행 중인 작업이 없습니다";
    case "done":
      return "완료된 작업이 없습니다";
  }
};

const getStatusIcon = (status: Status) => {
  switch (status) {
    case "todo":
      return Circle;
    case "doing":
      return Loader;
    case "done":
      return CheckCircle;
  }
};

const KanbanColumn = ({
  title,
  status,
  todos,
  allTodos,
  onNavigate,
  isMobile = false,
  onStatusChange,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const getParentTitle = (parentId: string | null) => {
    if (!parentId) return undefined;
    const parent = allTodos.find((t) => t.id === parentId);
    return parent?.title;
  };

  const StatusIcon = getStatusIcon(status);

  return (
    <KanbanColumnStyled>
      <ColumnTitle>{title}</ColumnTitle>
      <SortableContext
        items={todos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        id={status}
      >
        <KanbanItemList ref={setNodeRef} $isOver={isOver}>
          {todos.length === 0 ? (
            <EmptyColumn>
              <EmptyIcon>
                <StatusIcon size={32} />
              </EmptyIcon>
              <EmptyText>{getEmptyMessage(status)}</EmptyText>
            </EmptyColumn>
          ) : (
            todos.map((todo) => (
              <KanbanItem
                key={todo.id}
                todo={todo}
                parentTitle={getParentTitle(todo.parentId)}
                onNavigate={onNavigate}
                isMobile={isMobile}
                onStatusChange={onStatusChange}
              />
            ))
          )}
        </KanbanItemList>
      </SortableContext>
    </KanbanColumnStyled>
  );
};

export default KanbanColumn;

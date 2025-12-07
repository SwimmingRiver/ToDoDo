import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Todo } from "@/features/todo";
import KanbanItem from "./kanbanItem";
import { KanbanColumn as KanbanColumnStyled, ColumnTitle, KanbanItemList } from "./kanbanBoard.styles";

export type Status = "todo" | "doing" | "done";

interface KanbanColumnProps {
  title: string;
  status: Status;
  todos: Todo[];
  allTodos: Todo[];
  onNavigate: (id: string) => void;
}

const KanbanColumn = ({
  title,
  status,
  todos,
  allTodos,
  onNavigate,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const getParentTitle = (parentId: string | null) => {
    if (!parentId) return undefined;
    const parent = allTodos.find((t) => t.id === parentId);
    return parent?.title;
  };

  return (
    <KanbanColumnStyled>
      <ColumnTitle>{title}</ColumnTitle>
      <SortableContext
        items={todos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        id={status}
      >
        <KanbanItemList ref={setNodeRef} $isOver={isOver}>
          {todos.map((todo) => (
            <KanbanItem
              key={todo.id}
              todo={todo}
              parentTitle={getParentTitle(todo.parentId)}
              onNavigate={onNavigate}
            />
          ))}
        </KanbanItemList>
      </SortableContext>
    </KanbanColumnStyled>
  );
};

export default KanbanColumn;

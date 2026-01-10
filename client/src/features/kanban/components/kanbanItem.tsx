import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Todo } from "@/features/todo";
import { KanbanItemStyled, ParentLabel, ItemTitle } from "./kanbanBoard.styles";

interface KanbanItemProps {
  todo: Todo;
  parentTitle?: string;
  onNavigate: (id: string) => void;
}

const KanbanItem = ({ todo, parentTitle, onNavigate }: KanbanItemProps) => {
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
      {parentTitle && <ParentLabel>{parentTitle}</ParentLabel>}
      <ItemTitle>{todo.title}</ItemTitle>
    </KanbanItemStyled>
  );
};

export default KanbanItem;

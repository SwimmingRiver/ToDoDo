import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Todo } from "@/features/todo";
import { RecurrenceBadge } from "@/shared";
import KanbanCardMenu from "./kanbanCardMenu";
import type { Status } from "./kanbanColumn";
import {
  KanbanItemStyled,
  ParentLabel,
  ItemTitle,
  ItemTitleRow,
  ItemContentRow,
} from "./kanbanBoard.styles";

interface KanbanItemProps {
  todo: Todo;
  parentTitle?: string;
  onNavigate: (id: string) => void;
  isMobile?: boolean;
  onStatusChange?: (todo: Todo, status: Status) => void;
}

const KanbanItem = ({
  todo,
  parentTitle,
  onNavigate,
  isMobile = false,
  onStatusChange,
}: KanbanItemProps) => {
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

  // 모바일(태블릿 이하)에서는 탭 하나의 컬럼만 DOM에 존재해 드래그로 상태를 옮길 수
  // 없다(kanbanBoard.tsx). 드래그 리스너를 그대로 붙여두면 사용자가 드래그를
  // 시도해도 아무 것도 저장되지 않고 스냅백만 되므로, 카드의 "..." 액션시트로
  // 대체된 모바일에서는 리스너 자체를 적용하지 않는다.
  const dragListeners = isMobile ? undefined : listeners;

  // BottomSheet의 onSelect deps로 흘러들어가는 콜백을 안정화한다(카드마다 별도로
  // 마운트되는 BottomSheet가 렌더마다 내부 이펙트를 재실행하지 않도록).
  const handleStatusSelect = useCallback(
    (status: Status) => {
      onStatusChange?.(todo, status);
    },
    [onStatusChange, todo],
  );

  return (
    <KanbanItemStyled
      ref={setNodeRef}
      style={style}
      $isDragging={isDragging}
      {...attributes}
      {...dragListeners}
      onClick={() => onNavigate(todo.id)}
    >
      {parentTitle && <ParentLabel>{parentTitle}</ParentLabel>}
      <ItemContentRow>
        <ItemTitleRow>
          <ItemTitle>{todo.title}</ItemTitle>
          {todo.recurrenceId != null && <RecurrenceBadge />}
        </ItemTitleRow>
        {isMobile && onStatusChange && (
          <KanbanCardMenu status={todo.status} onSelect={handleStatusSelect} />
        )}
      </ItemContentRow>
    </KanbanItemStyled>
  );
};

export default KanbanItem;

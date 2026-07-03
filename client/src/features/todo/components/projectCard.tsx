import { useState } from "react";
import type { Todo } from "../types";
import type { ProjectCardData } from "../utils/projectUtils";
import ChildTodoCard from "./childTodoCard";
import { TrashIcon, ChevronRight, ChevronDown, Plus, Circle, Loader, CheckCircle } from "lucide-react";
import BottomSheet from "@/shared/ui/bottomSheet/bottomSheet";
import type { BottomSheetOption } from "@/shared/ui/bottomSheet/bottomSheet";
import useMediaQuery from "@/shared/hooks/useMediaQuery";
import { useTodo } from "../hooks";
import { useToast, RecurrenceBadge } from "@/shared";
import { statusColors, type Status } from "@/styles/statusColors";
import {
  CardContainer,
  CardHeader,
  CardLeft,
  CardRight,
  ColorDot,
  CardTitleGroup,
  CardTitle,
  CardSubtitle,
  OverdueBadge,
  IconButton,
  ProgressBar,
  ProgressFill,
  ExpandedArea,
  ChildTodoCardList,
  EmptyChildMessage,
  SheetDeleteButton,
  StatusDotButton,
} from "./projectCard.styles";

interface ProjectCardProps {
  data: ProjectCardData;
  onCardClick: (todo: Todo) => void;
  onToggleExpand: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
}

const ProjectCard = ({
  data,
  onCardClick,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddChild,
}: ProjectCardProps) => {
  const { todo, childTodos, progress, subtaskInfo, overdueInfo, isExpanded } =
    data;

  const { isOverdue, daysOver } = overdueInfo;
  const isMobile = useMediaQuery("tablet");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const { useUpdateTodo } = useTodo();
  const toast = useToast();

  const subtitleText =
    subtaskInfo.total > 0
      ? `${subtaskInfo.total}개 할일 · ${subtaskInfo.statusText}`
      : subtaskInfo.statusText;

  const STATUS_OPTIONS: BottomSheetOption<Status>[] = [
    { value: "todo", label: "할 일", icon: <Circle size={18} color={statusColors.todo.main} /> },
    { value: "doing", label: "진행 중", icon: <Loader size={18} color={statusColors.doing.main} /> },
    { value: "done", label: "완료", icon: <CheckCircle size={18} color={statusColors.done.main} /> },
  ];

  const handleStatusChange = (newStatus: Status) => {
    useUpdateTodo.mutate(
      { ...todo, status: newStatus },
      {
        onSuccess: () =>
          toast.success("상태 변경", `"${todo.title}" 상태가 변경되었습니다`),
        onError: () =>
          toast.error("변경 실패", "상태 변경 중 오류가 발생했습니다"),
      }
    );
    setIsStatusOpen(false);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) setIsSheetOpen(true);
    else onToggleExpand(todo.id);
  };

  return (
    <>
      <CardContainer $isOverdue={isOverdue}>
        <CardHeader onClick={() => onCardClick(todo)}>
          <CardLeft>
            <StatusDotButton
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusOpen(true);
              }}
              aria-label="프로젝트 상태 변경"
            >
              <ColorDot $isOverdue={isOverdue} />
            </StatusDotButton>
            <CardTitleGroup>
              <CardTitle>{todo.title}</CardTitle>
              <CardSubtitle>{subtitleText}</CardSubtitle>
            </CardTitleGroup>
            {todo.recurrenceId != null && <RecurrenceBadge />}
            {isOverdue && <OverdueBadge>{daysOver}일 초과</OverdueBadge>}
          </CardLeft>
          <CardRight>
            {!isMobile && (
              <IconButton
                $variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(todo.id);
                }}
                aria-label="프로젝트 삭제"
              >
                <TrashIcon size={15} />
              </IconButton>
            )}
            <IconButton
              $variant="expand"
              onClick={(e) => {
                if (todo.recurrence) return;
                e.stopPropagation();
                onAddChild(todo.id);
              }}
              disabled={todo.recurrence != null}
              aria-disabled={todo.recurrence != null}
              title={
                todo.recurrence != null
                  ? "반복 할 일에는 하위 작업을 추가할 수 없습니다"
                  : undefined
              }
              aria-label="하위 작업 추가"
            >
              <Plus size={15} />
            </IconButton>
            <IconButton
              $variant="expand"
              onClick={handleChevronClick}
              aria-label={isExpanded ? "프로젝트 접기" : "프로젝트 펼치기"}
            >
              {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </IconButton>
          </CardRight>
        </CardHeader>
        <ProgressBar>
          <ProgressFill $progress={progress} $isOverdue={isOverdue} />
        </ProgressBar>
        {!isMobile && isExpanded && (
          <ExpandedArea>
            {childTodos.length === 0 ? (
              <EmptyChildMessage>하위 항목이 없습니다</EmptyChildMessage>
            ) : (
              childTodos.map((childTodo) => (
                <ChildTodoCard
                  key={childTodo.id}
                  todo={childTodo}
                  onEdit={onEdit}
                />
              ))
            )}
          </ExpandedArea>
        )}
      </CardContainer>

      {isMobile && isSheetOpen && (
        <BottomSheet
          isOpen={true}
          onClose={() => setIsSheetOpen(false)}
          title={todo.title}
        >
          <ChildTodoCardList>
            {childTodos.length === 0 ? (
              <EmptyChildMessage>하위 항목이 없습니다</EmptyChildMessage>
            ) : (
              childTodos.map((childTodo) => (
                <ChildTodoCard
                  key={childTodo.id}
                  todo={childTodo}
                  onEdit={onEdit}
                />
              ))
            )}
          </ChildTodoCardList>
          <SheetDeleteButton
            onClick={() => {
              setIsSheetOpen(false);
              onDelete(todo.id);
            }}
          >
            <TrashIcon size={15} /> 프로젝트 삭제
          </SheetDeleteButton>
        </BottomSheet>
      )}

      <BottomSheet
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
        title="상태 변경"
        options={STATUS_OPTIONS}
        selectedValue={todo.status}
        onSelect={handleStatusChange}
      />
    </>
  );
};

export default ProjectCard;

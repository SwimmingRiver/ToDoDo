import { useState } from "react";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal, useToast } from "@/shared";
import { useTodo } from "../hooks";
import type { Todo } from "../types";
import type { Status } from "@/styles/statusColors";
import {
  ChildCardWrapper,
  ChildCardContainer,
  ChildCardLeft,
  ChildCardStatusDot,
  ChildCardTitle,
  ChildCardRight,
  IconButton,
  InlineStatusRow,
  StatusPill,
  StatusDotTrigger,
} from "./projectCard.styles";

const STATUS_LABELS: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

const ChildTodoCard = ({
  todo,
  onEdit,
}: {
  todo: Todo;
  onEdit: (todo: Todo) => void;
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const { useDeleteTodo, useUpdateTodo } = useTodo();
  const navigate = useNavigate();
  const toast = useToast();

  const handleDelete = () => {
    useDeleteTodo.mutate(todo.id, {
      onSuccess: () => {
        setIsDeleteOpen(false);
        toast.success("삭제 완료", `"${todo.title}" 할 일이 삭제되었습니다`);
      },
      onError: () => {
        setIsDeleteOpen(false);
        toast.error("삭제 실패", "할 일 삭제 중 오류가 발생했습니다");
      },
    });
  };

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

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteOpen}
        title="할 일 삭제"
        message={`"${todo.title}"을(를) 삭제하시겠습니까?`}
        confirmText="삭제"
        cancelText="취소"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
      <ChildCardWrapper $status={todo.status}>
        <ChildCardContainer>
          <ChildCardLeft>
            <StatusDotTrigger
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusOpen(!isStatusOpen);
              }}
              aria-label="상태 변경"
            >
              <ChildCardStatusDot $status={todo.status} />
            </StatusDotTrigger>
            <ChildCardTitle onClick={() => navigate(`/todo/${todo.id}`)}>
              {todo.title}
            </ChildCardTitle>
          </ChildCardLeft>
          <ChildCardRight>
            <IconButton onClick={() => onEdit(todo)} aria-label="할 일 편집">
              <PencilIcon size={14} />
            </IconButton>
            <IconButton
              $variant="danger"
              onClick={() => setIsDeleteOpen(true)}
              aria-label="할 일 삭제"
            >
              <TrashIcon size={14} />
            </IconButton>
          </ChildCardRight>
        </ChildCardContainer>
        {isStatusOpen && (
          <InlineStatusRow>
            {(["todo", "doing", "done"] as Status[]).map((status) => (
              <StatusPill
                key={status}
                $status={status}
                $isActive={status === todo.status}
                onClick={() => handleStatusChange(status)}
              >
                <ChildCardStatusDot $status={status} />
                {STATUS_LABELS[status]}
              </StatusPill>
            ))}
          </InlineStatusRow>
        )}
      </ChildCardWrapper>
    </>
  );
};

export default ChildTodoCard;

import type { Todo } from "../../types";
import { PencilIcon, TrashIcon, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTodo } from "../../hooks";
import { useNavigate } from "react-router-dom";
import { ConfirmModal, useToast } from "@/shared";
import {
  TodoListItemContainer,
  ExpandButton,
  AddChildButton,
  StatusSelect,
  TodoTitle,
  TodoIconButton,
  ButtonGroup,
} from "./todoListItem.styles";

const TodoListItem = ({
  todo,
  isChild,
  childTodos,
  onEdit,
  onAddChild,
}: {
  todo: Todo;
  isChild?: boolean;
  childTodos?: Todo[];
  onEdit: (todo: Todo) => void;
  onAddChild?: (parentId: string) => void;
}) => {
  const [isMore, setIsMore] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { useDeleteTodo, useUpdateTodo } = useTodo();
  const navigate = useNavigate();
  const toast = useToast();

  const handleDelete = () => {
    useDeleteTodo.mutate(todo.id, {
      onSuccess: () => {
        toast.success("삭제 완료", `"${todo.title}" 할 일이 삭제되었습니다`);
      },
      onError: () => {
        toast.error("삭제 실패", "할 일 삭제 중 오류가 발생했습니다");
      },
    });
    setIsDeleteModalOpen(false);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "todo": return "할 일";
      case "doing": return "진행 중";
      case "done": return "완료";
      default: return status;
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as "todo" | "doing" | "done";
    useUpdateTodo.mutate({
      ...todo,
      status: newStatus,
    }, {
      onSuccess: () => {
        if (newStatus === "done") {
          toast.success("완료!", `"${todo.title}" 할 일을 완료했습니다`);
        } else {
          toast.info("상태 변경", `"${todo.title}" → ${getStatusLabel(newStatus)}`);
        }
      },
    });
  };
  return (
    <>
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="할 일 삭제"
        message={`"${todo.title}"을(를) 삭제하시겠습니까?`}
        confirmText="삭제"
        cancelText="취소"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
      <TodoListItemContainer key={todo.id} isChild={isChild}>
        <StatusSelect value={todo.status} onChange={handleStatusChange}>
          <option value="todo">Todo</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
        </StatusSelect>
        <TodoTitle onClick={() => navigate(`/todo/${todo.id}`)}>
          {todo.title}
        </TodoTitle>
        <ButtonGroup>
          <TodoIconButton onClick={() => onEdit?.(todo)}>
            <PencilIcon size={16} />
          </TodoIconButton>
          <TodoIconButton $variant="danger" onClick={() => setIsDeleteModalOpen(true)}>
            <TrashIcon size={16} />
          </TodoIconButton>
        </ButtonGroup>
        {!isChild && (
          <ExpandButton isExpanded={isMore} onClick={() => setIsMore(!isMore)}>
            {isMore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {childTodos && childTodos.length > 0 ? childTodos.length : ""}
          </ExpandButton>
        )}
      </TodoListItemContainer>
      {isMore && (
        <>
          {childTodos?.map((childTodo) => (
            <TodoListItem
              key={childTodo.id}
              todo={childTodo}
              isChild={true}
              onEdit={onEdit}
              onAddChild={onAddChild}
            />
          ))}
          <AddChildButton onClick={() => onAddChild?.(todo.id)}>
            <Plus size={14} /> 새 하위 작업 추가
          </AddChildButton>
        </>
      )}
    </>
  );
};

export default TodoListItem;

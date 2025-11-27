import { styled, keyframes } from "styled-components";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTodoDetail, useTodo } from "./queries";
import type { Todo } from "../../types/todo.type";

const slideIn = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: ${fadeIn} 0.3s ease-out;
`;

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 50%;
  height: 100vh;
  background-color: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 101;
  animation: ${slideIn} 0.3s ease-out;
  display: flex;
  flex-direction: column;
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;

  &:hover {
    background-color: #f0f0f0;
    color: #333;
  }
`;

const PanelContent = styled.div`
  flex: 1;
  padding: 24px;
  overflow-y: auto;
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
  }
`;

const InfoRow = styled.div`
  display: flex;
  gap: 16px;
`;

const InfoItem = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: #888;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: #333;
`;

const PanelFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: #1c72eb;
    color: white;
    border: none;

    &:hover {
      background-color: #1560c7;
    }
  `
      : `
    background-color: white;
    color: #666;
    border: 1px solid #ddd;

    &:hover {
      background-color: #f5f5f5;
    }
  `}
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  ${({ $status }) => {
    switch ($status) {
      case "todo":
        return `background-color: #e3f2fd; color: #1976d2;`;
      case "doing":
        return `background-color: #fff3e0; color: #f57c00;`;
      case "done":
        return `background-color: #e8f5e9; color: #388e3c;`;
      default:
        return `background-color: #f5f5f5; color: #666;`;
    }
  }}
`;

const PriorityBadge = styled.span<{ $priority: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  ${({ $priority }) => {
    switch ($priority) {
      case "high":
        return `background-color: #ffebee; color: #d32f2f;`;
      case "medium":
        return `background-color: #fff3e0; color: #f57c00;`;
      case "low":
        return `background-color: #e8f5e9; color: #388e3c;`;
      default:
        return `background-color: #f5f5f5; color: #666;`;
    }
  }}
`;

interface TodoFormData {
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  startAt?: string;
  dueAt?: string;
}

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const TodoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { todo } = useTodoDetail({ id: id! });
  const { useUpdateTodo } = useTodo();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TodoFormData>({
    values: todo
      ? {
          title: todo.title,
          description: todo.description || "",
          status: todo.status,
          priority: todo.priority,
          startAt: todo.startAt
            ? new Date(todo.startAt).toISOString().slice(0, 16)
            : "",
          dueAt: todo.dueAt
            ? new Date(todo.dueAt).toISOString().slice(0, 16)
            : "",
        }
      : undefined,
  });

  const handleClose = () => {
    navigate("/");
  };

  const onSubmit = (data: TodoFormData) => {
    if (!todo) return;

    useUpdateTodo.mutate(
      {
        ...todo,
        ...data,
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
      } as Todo,
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  if (!todo) {
    return null;
  }

  return (
    <>
      <Overlay onClick={handleClose} />
      <Panel>
        <PanelHeader>
          <PanelTitle>Todo 상세</PanelTitle>
          <CloseButton onClick={handleClose}>×</CloseButton>
        </PanelHeader>

        <PanelContent>
          <FormContainer id="todo-detail-form" onSubmit={handleSubmit(onSubmit)}>
            <InfoRow>
              <InfoItem>
                <InfoLabel>생성일</InfoLabel>
                <InfoValue>{formatDateTime(todo.createdAt)}</InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>수정일</InfoLabel>
                <InfoValue>{formatDateTime(todo.updatedAt)}</InfoValue>
              </InfoItem>
              {todo.doneAt && (
                <InfoItem>
                  <InfoLabel>완료일</InfoLabel>
                  <InfoValue>{formatDateTime(todo.doneAt)}</InfoValue>
                </InfoItem>
              )}
            </InfoRow>

            <InfoRow>
              <InfoItem>
                <InfoLabel>현재 상태</InfoLabel>
                <div>
                  <StatusBadge $status={todo.status}>
                    {todo.status === "todo"
                      ? "할 일"
                      : todo.status === "doing"
                      ? "진행 중"
                      : "완료"}
                  </StatusBadge>
                </div>
              </InfoItem>
              <InfoItem>
                <InfoLabel>현재 우선순위</InfoLabel>
                <div>
                  <PriorityBadge $priority={todo.priority}>
                    {todo.priority === "high"
                      ? "높음"
                      : todo.priority === "medium"
                      ? "중간"
                      : "낮음"}
                  </PriorityBadge>
                </div>
              </InfoItem>
            </InfoRow>

            <FormGroup>
              <Label>제목</Label>
              <Input
                {...register("title", { required: "제목을 입력해주세요" })}
                placeholder="할 일 제목"
              />
              {errors.title && (
                <span style={{ color: "red", fontSize: "12px" }}>
                  {errors.title.message}
                </span>
              )}
            </FormGroup>

            <FormGroup>
              <Label>설명</Label>
              <TextArea
                {...register("description")}
                placeholder="상세 설명을 입력하세요"
              />
            </FormGroup>

            <InfoRow>
              <FormGroup style={{ flex: 1 }}>
                <Label>상태</Label>
                <Select {...register("status")}>
                  <option value="todo">할 일</option>
                  <option value="doing">진행 중</option>
                  <option value="done">완료</option>
                </Select>
              </FormGroup>

              <FormGroup style={{ flex: 1 }}>
                <Label>우선순위</Label>
                <Select {...register("priority")}>
                  <option value="low">낮음</option>
                  <option value="medium">중간</option>
                  <option value="high">높음</option>
                </Select>
              </FormGroup>
            </InfoRow>

            <InfoRow>
              <FormGroup style={{ flex: 1 }}>
                <Label>시작일시</Label>
                <Input type="datetime-local" {...register("startAt")} />
              </FormGroup>

              <FormGroup style={{ flex: 1 }}>
                <Label>마감일시</Label>
                <Input type="datetime-local" {...register("dueAt")} />
              </FormGroup>
            </InfoRow>
          </FormContainer>
        </PanelContent>

        <PanelFooter>
          <Button type="button" onClick={handleClose}>
            취소
          </Button>
          <Button type="submit" form="todo-detail-form" $variant="primary">
            저장
          </Button>
        </PanelFooter>
      </Panel>
    </>
  );
};

export default TodoDetail;

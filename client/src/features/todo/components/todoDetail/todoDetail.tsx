import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTodoDetail, useTodo } from "../../hooks";
import type { Todo } from "../../types";
import {
  Overlay,
  Panel,
  PanelHeader,
  PanelTitle,
  PanelContent,
  PanelFooter,
  CloseButton,
  FormContainer,
  InfoRow,
  InfoItem,
  InfoLabel,
  InfoValue,
  StatusBadge,
  PriorityBadge,
  FormGroup,
  Label,
  Input,
  TextArea,
  Select,
  Button,
} from "./todoDetail.styles";

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
          <FormContainer
            id="todo-detail-form"
            onSubmit={handleSubmit(onSubmit)}
          >
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

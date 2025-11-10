import { useForm } from "react-hook-form";
import { styled } from "styled-components";
import { useState } from "react";

import { useTodo } from "./queries";
import type { Todo } from "../../types/todo.type";
const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
`;

const InputLabel = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: #1c72eb;
  }
`;

const MoreButton = styled.button`
  height: 40px;
  border: none;
  cursor: pointer;
  background: none;
  color: #1c72eb;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const MoreButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DetailSection = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows 0.3s ease-in-out;
  overflow: hidden;
`;

const DetailContent = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;

  &:focus {
    border-color: #1c72eb;
  }
`;

interface TodoFormData {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  startAt?: string;
  dueAt?: string;
}

interface TodoFormProps {
  todo?: Todo;
  onClose?: () => void;
}

const TodoForm = ({ todo, onClose }: TodoFormProps) => {
  const [showMore, setShowMore] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TodoFormData>({
    defaultValues: todo ? {
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      startAt: todo.startAt ? new Date(todo.startAt).toISOString().slice(0, 16) : undefined,
      dueAt: todo.dueAt ? new Date(todo.dueAt).toISOString().slice(0, 16) : undefined,
    } : undefined,
  });
  const { userCreateTodo, userUpdateTodo } = useTodo();
  const onSubmit = (data: TodoFormData) => {
    if (todo) {
      // 수정 시 기존 todo의 모든 필드를 유지하면서 변경된 필드만 덮어씀
      userUpdateTodo.mutate({
        ...todo,
        ...data,
        // datetime-local input의 값을 ISO string으로 변환
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
      } as Todo, {
        onSuccess: () => {
          onClose?.();
        },
      });
    } else {
      userCreateTodo.mutate(data as Todo, {
        onSuccess: () => {
          onClose?.();
        },
      });
    }
  };

  return (
    <FormContainer id="todo-form" onSubmit={handleSubmit(onSubmit)}>
      <InputLabel>할 일</InputLabel>
      <Input
        {...register("title", { required: "제목을 입력해주세요" })}
        placeholder="무엇을 해야 하나요?"
        autoFocus
      />
      {errors.title && (
        <span style={{ color: "red", fontSize: "12px" }}>
          {errors.title.message}
        </span>
      )}

      <DetailSection $isOpen={showMore}>
        <DetailContent>
          <InputLabel>설명</InputLabel>
          <Input
            {...register("description")}
            placeholder="상세 설명을 입력하세요"
          />

          <InputLabel>우선순위</InputLabel>
          <Select {...register("priority")} defaultValue="medium">
            <option value="low">낮음</option>
            <option value="medium">중간</option>
            <option value="high">높음</option>
          </Select>

          <InputLabel>시작일시</InputLabel>
          <Input type="datetime-local" {...register("startAt")} />

          <InputLabel>만료일시</InputLabel>
          <Input type="datetime-local" {...register("dueAt")} />
        </DetailContent>
      </DetailSection>

      <MoreButtonContainer>
        <MoreButton type="button" onClick={() => setShowMore(!showMore)}>
          {showMore ? "간단히" : "더보기"}
        </MoreButton>
      </MoreButtonContainer>
    </FormContainer>
  );
};

export default TodoForm;

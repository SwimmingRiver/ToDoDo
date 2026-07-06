import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTodoDetail, useTodo } from "../../hooks";
import type { Todo } from "../../types";
import { X } from "lucide-react";
import { useToast, ConfirmModal, toDatetimeLocalValue } from "@/shared";
import RecurrenceFields from "../recurrence/recurrenceFields";
import { getRecurrenceValidationError } from "../recurrence/recurrenceValidation";
import { toFormValue, toRecurrenceRule } from "../recurrence/recurrenceTransform";
import type { RecurrenceFormValue } from "../recurrence/recurrenceFields.types";
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
  ErrorText,
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
  const {
    useUpdateTodo,
    useCreateRecurringTodo,
    useEditRecurringSeries,
    useDeleteTodo,
    useGetTodos,
  } = useTodo();
  const { data: allTodos } = useGetTodos;
  const toast = useToast();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TodoFormData>({
    values: todo
      ? {
          title: todo.title,
          description: todo.description || "",
          status: todo.status,
          priority: todo.priority,
          startAt: todo.startAt ? toDatetimeLocalValue(todo.startAt) : "",
          dueAt: todo.dueAt ? toDatetimeLocalValue(todo.dueAt) : "",
        }
      : undefined,
  });

  const dueAtWatch = watch("dueAt");

  const hasChildren = useMemo(() => {
    if (!todo) return false;
    return (allTodos ?? []).some((t) => t.parentId === todo.id);
  }, [allTodos, todo]);

  const [recurrenceValue, setRecurrenceValue] = useState<RecurrenceFormValue | null>(null);

  // 상세 페이지가 새 todo를 불러올 때(id 변경)만 로컬 recurrence 상태를 동기화한다.
  useEffect(() => {
    if (todo) {
      setRecurrenceValue(toFormValue(todo.recurrence));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo?.id]);

  // 4-2절: dueAt이 지워지면(반복이 이미 켜진 상태) 반복 체크박스 강제 OFF + value 리셋
  useEffect(() => {
    if (!dueAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueAtWatch]);

  const recurrenceDisabled = hasChildren || !dueAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noDueAt" | undefined = hasChildren
    ? "hasChildren"
    : !dueAtWatch
      ? "noDueAt"
      : undefined;

  const [isSeriesConfirmOpen, setIsSeriesConfirmOpen] = useState(false);
  const [pendingSeriesUpdate, setPendingSeriesUpdate] = useState<Todo | null>(null);

  const handleClose = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate("/today");
    }
  };

  const closeSeriesConfirm = () => {
    setIsSeriesConfirmOpen(false);
    setPendingSeriesUpdate(null);
  };

  const handleConfirmSeriesEdit = () => {
    if (!pendingSeriesUpdate) return;
    useEditRecurringSeries.mutate(pendingSeriesUpdate, {
      onSuccess: () => {
        toast.success("저장 완료", "반복 일정이 성공적으로 저장되었습니다");
        closeSeriesConfirm();
        handleClose();
      },
      onError: () => {
        toast.error("저장 실패", "반복 일정 저장 중 오류가 발생했습니다. 다시 시도해주세요");
        closeSeriesConfirm();
      },
    });
  };

  const onSubmit = (data: TodoFormData) => {
    if (!todo) return;

    const validationError = getRecurrenceValidationError(recurrenceValue, dueAtWatch ?? null);
    if (validationError) {
      toast.error("입력 확인", validationError);
      return;
    }

    const newRecurrence = toRecurrenceRule(recurrenceValue);
    const updatedFields = {
      ...todo,
      ...data,
      startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
      dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
      recurrence: newRecurrence,
    } as Todo;

    const wasRecurring = todo.recurrence != null;

    if (wasRecurring) {
      // 4-4절: 반복 시리즈였던 할 일의 수정(반복 유지든 OFF 전환이든)은 확인 모달을 먼저 띄운다.
      setPendingSeriesUpdate(updatedFields);
      setIsSeriesConfirmOpen(true);
      return;
    }

    if (!wasRecurring && newRecurrence) {
      // todoForm.tsx와 동일한 근거: editRecurringSeries는 recurrenceId 없이는 호출할 수
      // 없으므로(todoApi.ts), 원래 비반복이던 todo를 새로 반복 전환할 때는
      // createRecurringTodo로 새 인스턴스를 먼저 만들고 성공 후에만 기존 문서를 삭제한다.
      useCreateRecurringTodo.mutate(updatedFields, {
        onSuccess: () => {
          useDeleteTodo.mutate(todo.id, {
            onSuccess: () => {
              toast.success("반복 설정 완료", "할 일이 반복 일정으로 전환되었습니다");
              handleClose();
            },
            onError: () => {
              toast.error(
                "정리 실패",
                "새 반복 일정은 생성되었지만 기존 항목 정리에 실패했습니다. 목록을 확인해주세요",
              );
              handleClose();
            },
          });
        },
        onError: () => {
          toast.error("저장 실패", "할 일 저장 중 오류가 발생했습니다. 다시 시도해주세요");
        },
      });
      return;
    }

    useUpdateTodo.mutate(updatedFields, {
      onSuccess: () => {
        toast.success("저장 완료", "할 일이 성공적으로 저장되었습니다");
        handleClose();
      },
      onError: () => {
        toast.error("저장 실패", "할 일 저장 중 오류가 발생했습니다. 다시 시도해주세요");
      },
    });
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
          <CloseButton onClick={handleClose} aria-label="닫기">
            <X size={20} />
          </CloseButton>
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
                <ErrorText>{errors.title.message}</ErrorText>
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

            <FormGroup>
              <Label>시작일시</Label>
              <Input type="datetime-local" {...register("startAt")} />
            </FormGroup>

            <FormGroup>
              <Label>마감일시</Label>
              <Input type="datetime-local" {...register("dueAt")} />
            </FormGroup>

            {!todo.parentId && (
              <FormGroup>
                <RecurrenceFields
                  disabled={recurrenceDisabled}
                  disabledReason={recurrenceDisabledReason}
                  dueAt={dueAtWatch ?? null}
                  value={recurrenceValue}
                  onChange={setRecurrenceValue}
                />
              </FormGroup>
            )}
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

      <ConfirmModal
        isOpen={isSeriesConfirmOpen}
        title="반복 일정 전체 수정"
        message={
          "이 변경은 앞으로의 일정과 지금 수정 중인 일정에 적용됩니다.\n\n그 외 이미 완료됐거나 진행 중/지난 다른 회차는 그대로 유지됩니다."
        }
        confirmText="전체 적용"
        cancelText="취소"
        confirmDisabled={useEditRecurringSeries.isPending}
        onConfirm={handleConfirmSeriesEdit}
        onCancel={closeSeriesConfirm}
      />
    </>
  );
};

export default TodoDetail;

import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";

import { useTodo } from "../../hooks";
import { useToast, ConfirmModal } from "@/shared";
import type { RecurrenceRule, Todo } from "../../types";
import RecurrenceFields from "../recurrence/recurrenceFields";
import { getRecurrenceValidationError } from "../recurrence/recurrenceValidation";
import { toFormValue, toRecurrenceRule } from "../recurrence/recurrenceTransform";
import type { RecurrenceFormValue } from "../recurrence/recurrenceFields.types";
import {
  FormContainer,
  InputLabel,
  Input,
  MoreButton,
  MoreButtonContainer,
  DetailSection,
  DetailContent,
  Select,
} from "./todoFrom.styles";

interface TodoFormData {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  startAt?: string;
  dueAt?: string;
}

interface TodoFormProps {
  todo?: Todo;
  parentId?: string;
  initialDueAt?: string;
  onClose?: () => void;
}

const TodoForm = ({ todo, parentId, initialDueAt, onClose }: TodoFormProps) => {
  const [showMore, setShowMore] = useState(false);
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TodoFormData>({
    defaultValues: todo
      ? {
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          startAt: todo.startAt
            ? new Date(todo.startAt).toISOString().slice(0, 16)
            : undefined,
          dueAt: todo.dueAt
            ? new Date(todo.dueAt).toISOString().slice(0, 16)
            : undefined,
        }
      : initialDueAt
        ? { dueAt: initialDueAt }
        : undefined,
  });
  const {
    useCreateTodo,
    useUpdateTodo,
    useCreateChildTodo,
    useCreateRecurringTodo,
    useEditRecurringSeries,
    useDeleteTodo,
    useGetTodos,
  } = useTodo();
  const { data: allTodos } = useGetTodos;

  const dueAtWatch = watch("dueAt");

  // 하위 할 일 생성 폼(parentId 존재, 케이스 D)에서는 반복 섹션 자체를 렌더링하지 않는다.
  const showRecurrenceSection = !parentId;

  const hasChildren = useMemo(() => {
    if (!todo) return false;
    return (allTodos ?? []).some((t) => t.parentId === todo.id);
  }, [allTodos, todo]);

  const [recurrenceValue, setRecurrenceValue] = useState<RecurrenceFormValue | null>(
    () => toFormValue(todo?.recurrence ?? null),
  );

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

  const closeSeriesConfirm = () => {
    setIsSeriesConfirmOpen(false);
    setPendingSeriesUpdate(null);
  };

  const handleConfirmSeriesEdit = () => {
    if (!pendingSeriesUpdate) return;
    useEditRecurringSeries.mutate(pendingSeriesUpdate, {
      onSuccess: () => {
        toast.success("수정 완료", `"${pendingSeriesUpdate.title}" 반복 일정이 수정되었습니다`);
        closeSeriesConfirm();
        onClose?.();
      },
      onError: () => {
        toast.error("수정 실패", "반복 일정 수정 중 오류가 발생했습니다");
        // 실패 시 모달만 닫고 폼은 유지(재시도 가능하도록) — pendingSeriesUpdate는 비운다
        closeSeriesConfirm();
      },
    });
  };

  const onSubmit = (data: TodoFormData) => {
    if (showRecurrenceSection) {
      const validationError = getRecurrenceValidationError(recurrenceValue, dueAtWatch ?? null);
      if (validationError) {
        toast.error("입력 확인", validationError);
        return;
      }
    }

    if (todo) {
      const newRecurrence = showRecurrenceSection ? toRecurrenceRule(recurrenceValue) : null;
      const updatedFields = {
        ...todo,
        ...data,
        // datetime-local input의 값을 ISO string으로 변환
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
        recurrence: newRecurrence,
      } as Todo;

      const wasRecurring = todo.recurrence != null;

      if (wasRecurring) {
        // 4-4절: 반복 시리즈였던 할 일의 수정(반복 유지든 OFF 전환이든)은 항상 확인 모달을
        // 먼저 띄우고, "전체 적용" 클릭 시에만 실제 mutate를 실행한다.
        setPendingSeriesUpdate(updatedFields);
        setIsSeriesConfirmOpen(true);
        return;
      }

      if (!wasRecurring && newRecurrence) {
        // 반복이 원래 없던 기존 할 일에 이번 저장에서 새로 반복을 켠 경우.
        // "신규 반복 설정"이지 시리즈 수정이 아니므로 확인 모달은 띄우지 않는다(4-4절).
        //
        // 판단 근거: useEditRecurringSeries(editRecurringSeries API)는 recurrenceId가
        // 없으면 즉시 에러를 던지도록 구현되어 있어(todoApi.ts), recurrenceId가 아직 null인
        // 이 기존 단일 todo에는 사용할 수 없다. 대신 useCreateRecurringTodo로 새 반복
        // 인스턴스들을 먼저 생성하고, 성공한 뒤에만 기존 단일 문서를 삭제한다 — 생성 실패 시
        // 기존 데이터가 그대로 보존되는 쪽이(반대 순서보다) 더 안전한 실패 모드이기 때문이다.
        useCreateRecurringTodo.mutate(updatedFields, {
          onSuccess: () => {
            useDeleteTodo.mutate(todo.id, {
              onSuccess: () => {
                toast.success(
                  "반복 설정 완료",
                  `"${data.title}" 할 일이 반복 일정으로 전환되었습니다`,
                );
                onClose?.();
              },
              onError: () => {
                toast.error(
                  "정리 실패",
                  "새 반복 일정은 생성되었지만 기존 항목 정리에 실패했습니다. 목록을 확인해주세요",
                );
                onClose?.();
              },
            });
          },
          onError: () => {
            toast.error("수정 실패", "할 일 수정 중 오류가 발생했습니다");
          },
        });
        return;
      }

      // 일반(비반복) 수정
      useUpdateTodo.mutate(updatedFields, {
        onSuccess: () => {
          toast.success("수정 완료", `"${data.title}" 할 일이 수정되었습니다`);
          onClose?.();
        },
        onError: () => {
          toast.error("수정 실패", "할 일 수정 중 오류가 발생했습니다");
        },
      });
    } else if (parentId) {
      // 자식 todo 생성 (반복 설정 대상 아님)
      useCreateChildTodo.mutate(
        {
          parentId,
          todo: data,
        },
        {
          onSuccess: () => {
            toast.success("추가 완료", `"${data.title}" 하위 할 일이 추가되었습니다`);
            onClose?.();
          },
          onError: () => {
            toast.error("추가 실패", "하위 할 일 추가 중 오류가 발생했습니다");
          },
        }
      );
    } else if (recurrenceValue) {
      // 반복 설정된 신규 할 일 생성 — 확인 모달 없음(4-4절)
      const newRecurrence = toRecurrenceRule(recurrenceValue) as RecurrenceRule;
      useCreateRecurringTodo.mutate(
        {
          ...data,
          startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
          dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
          recurrence: newRecurrence,
        } as Todo,
        {
          onSuccess: () => {
            toast.success("추가 완료", `"${data.title}" 반복 할 일이 추가되었습니다`);
            onClose?.();
          },
          onError: () => {
            toast.error("추가 실패", "반복 할 일 추가 중 오류가 발생했습니다");
          },
        }
      );
    } else {
      // 일반 todo 생성
      useCreateTodo.mutate(data as Todo, {
        onSuccess: () => {
          toast.success("추가 완료", `"${data.title}" 할 일이 추가되었습니다`);
          onClose?.();
        },
        onError: () => {
          toast.error("추가 실패", "할 일 추가 중 오류가 발생했습니다");
        },
      });
    }
  };

  return (
    <>
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

            {showRecurrenceSection && (
              <RecurrenceFields
                disabled={recurrenceDisabled}
                disabledReason={recurrenceDisabledReason}
                dueAt={dueAtWatch ?? null}
                value={recurrenceValue}
                onChange={setRecurrenceValue}
              />
            )}
          </DetailContent>
        </DetailSection>

        <MoreButtonContainer>
          <MoreButton type="button" onClick={() => setShowMore(!showMore)}>
            {showMore ? "간단히" : "더보기"}
          </MoreButton>
        </MoreButtonContainer>
      </FormContainer>

      <ConfirmModal
        isOpen={isSeriesConfirmOpen}
        title="반복 일정 전체 수정"
        message={
          "이 변경은 앞으로의 일정에만 적용됩니다.\n\n진행 중이거나 완료된 일정, 이미 지난 미완료 일정은 그대로 유지됩니다."
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

export default TodoForm;

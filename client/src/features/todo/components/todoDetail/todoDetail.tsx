import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTodoDetail, useTodo } from "../../hooks";
import type { Todo } from "../../types";
import { X, Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import {
  useToast,
  ConfirmModal,
  toDatetimeLocalValue,
  useAutoGrowTextArea,
  extractLinks,
  toDescriptionSegments,
  DESCRIPTION_MAX_LENGTH,
} from "@/shared";
import DescriptionLinkAction from "./descriptionLinkAction";
import useModal from "@/shared/hooks/useModal";
import Modal from "@/shared/ui/modal/modal";
import RecurrenceFields from "../recurrence/recurrenceFields";
import { getRecurrenceValidationError } from "../recurrence/recurrenceValidation";
import { toFormValue, toRecurrenceRule } from "../recurrence/recurrenceTransform";
import type { RecurrenceFormValue } from "../recurrence/recurrenceFields.types";
import ChildTodoCard from "../childTodoCard";
import TodoForm from "../todoForm/todoForm";
import { ProgressBar, ProgressFill, EmptyChildMessage } from "../projectCard.styles";
import { getProjectProgress, getProjectSubtaskInfo } from "../../utils/projectUtils";
import {
  Overlay,
  Panel,
  PanelHeader,
  PanelTitle,
  PanelContent,
  PanelFooter,
  PanelFooterActions,
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
  LabelRow,
  Input,
  TextArea,
  DescriptionField,
  DescriptionOverlay,
  OverlayLink,
  Select,
  Button,
  ErrorText,
  SubtaskSectionHeader,
  SubtaskLabelGroup,
  SubtaskCountBadge,
  SubtaskHeaderActions,
  SubtaskIconButton,
  SubtaskListContainer,
  EmptyChildAddButton,
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

const TodoDetailView = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const { todo } = useTodoDetail({ id });
  const {
    useUpdateTodo,
    useCreateRecurringTodo,
    useEditRecurringSeries,
    useDeleteTodo,
    useDeleteRecurringSeries,
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
    // values prop은 넘긴 객체가 달라지면 폼 전체를 서버 값으로 되돌린다. 그런데 그
    // 리셋을 유발하는 기능이 이 패널 안에 있다 — 하위 할 일을 추가하면 부모의
    // status/doneAt이 재계산되고 ["todoDetail"]이 무효화되므로, refetch된 status가
    // values를 바꾼다. 그대로 두면 그 순간 입력 중이던 설명이 사라진다.
    // 사용자가 건드린 필드만 지키고 나머지는 정상적으로 서버 값을 따라간다.
    resetOptions: { keepDirtyValues: true },
  });

  const startAtWatch = watch("startAt");
  const dueAtWatch = watch("dueAt");
  const descriptionWatch = watch("description");

  const { setRef: setDescriptionRef } = useAutoGrowTextArea(descriptionWatch);

  // 저장된 값이 아니라 입력 중인 값에서 링크를 뽑는다 — 붙여넣자마자 링크가 인식됐는지
  // 확인할 수 있어야 오탐(파일명 등)도 그 자리에서 알아챌 수 있다.
  const descriptionLinks = useMemo(
    () => extractLinks(descriptionWatch),
    [descriptionWatch]
  );

  // 본문 하이라이트용 — 위치를 보존하고 중복 URL도 각각 유지한다(extractLinks와 요구가 다름).
  const descriptionSegments = useMemo(
    () => toDescriptionSegments(descriptionWatch),
    [descriptionWatch]
  );
  // 링크가 없으면 오버레이를 아예 렌더하지 않는다 — 이득 없이 정렬 리스크만 지는 상태를 만들지 않는다.
  const hasDescriptionHighlight = descriptionSegments.some((s) => s.isLink);

  // register가 ref 슬롯을 가져가므로, auto-grow용 ref와 합치려면 미리 분리해 둔다.
  const { ref: descriptionFieldRef, ...descriptionField } = register("description", {
    maxLength: {
      value: DESCRIPTION_MAX_LENGTH,
      message: `설명은 ${DESCRIPTION_MAX_LENGTH}자 이내로 입력해주세요`,
    },
  });

  // register()는 매 렌더 새 ref 함수를 반환한다. 그대로 인라인으로 합치면 ref의
  // identity가 매번 달라져 React가 타건마다 ref를 null로 뗐다 다시 붙이고, 그때마다
  // setRef가 resize()를 호출해 강제 리플로우가 한 번 더 일어난다.
  // 최신 ref를 ref 박스에 담아 호출하면 stale 없이 identity를 고정할 수 있다.
  const latestFieldRef = useRef(descriptionFieldRef);
  latestFieldRef.current = descriptionFieldRef;

  const setDescriptionTextArea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      latestFieldRef.current(el);
      setDescriptionRef(el);
    },
    [setDescriptionRef]
  );

  // 하위 투두 배열 자체를 계산해두면(기존엔 존재 여부만 boolean으로 계산했음)
  // 반복 설정 비활성화 조건(hasChildren)과 신규 하위 투두 섹션 렌더링을 동일한
  // 데이터에서 파생시킬 수 있다 — 동작은 기존과 완전히 동일(existence -> length>0).
  const childTodos = useMemo(() => {
    if (!todo) return [];
    return (allTodos ?? []).filter((t) => t.parentId === todo.id);
  }, [allTodos, todo]);

  const hasChildren = childTodos.length > 0;

  const progress = useMemo(
    () => (todo ? getProjectProgress(allTodos ?? [], todo.id) : 0),
    [allTodos, todo],
  );
  const subtaskInfo = useMemo(
    () => (todo ? getProjectSubtaskInfo(allTodos ?? [], todo.id) : { total: 0, statusText: "" }),
    [allTodos, todo],
  );

  const [isSubtaskExpanded, setIsSubtaskExpanded] = useState(true);
  const { isOpen: isAddChildOpen, setIsOpen: setIsAddChildOpen } = useModal();
  const { isOpen: isEditChildOpen, setIsOpen: setIsEditChildOpen } = useModal();
  const [editingChildTodo, setEditingChildTodo] = useState<Todo | null>(null);

  const handleEditChild = (childTodo: Todo) => {
    setEditingChildTodo(childTodo);
    setIsEditChildOpen(true);
  };

  const [recurrenceValue, setRecurrenceValue] = useState<RecurrenceFormValue | null>(null);

  // 상세 페이지가 새 todo를 불러올 때(id 변경)만 로컬 recurrence 상태를 동기화한다.
  useEffect(() => {
    if (todo) {
      setRecurrenceValue(toFormValue(todo.recurrence));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo?.id]);

  // 반복의 시작 앵커는 startAt이다. startAt이 지워지면(반복이 이미 켜진 상태) 반복
  // 체크박스를 강제 OFF하고 value를 리셋한다.
  useEffect(() => {
    if (!startAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAtWatch]);

  const recurrenceDisabled = hasChildren || !startAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noStartAt" | undefined = hasChildren
    ? "hasChildren"
    : !startAtWatch
      ? "noStartAt"
      : undefined;

  const [isSeriesConfirmOpen, setIsSeriesConfirmOpen] = useState(false);
  const [pendingSeriesUpdate, setPendingSeriesUpdate] = useState<Todo | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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

  const handleConfirmDelete = () => {
    if (!todo) return;
    const title = todo.title;

    // todoList.tsx의 삭제 분기와 동일하게, 반복 시리즈면 recurrenceId 기준으로 전체
    // 시리즈를 지우고, 아니면 단일 문서만 지운다.
    if (todo.recurrenceId) {
      useDeleteRecurringSeries.mutate(todo.recurrenceId, {
        onSuccess: () => {
          toast.success("삭제 완료", `"${title}" 반복 일정이 모두 삭제되었습니다`);
          setIsDeleteConfirmOpen(false);
          handleClose();
        },
        onError: () => {
          toast.error("삭제 실패", "삭제 중 오류가 발생했습니다");
          setIsDeleteConfirmOpen(false);
        },
      });
      return;
    }

    useDeleteTodo.mutate(todo.id, {
      onSuccess: () => {
        toast.success("삭제 완료", `"${title}"이(가) 삭제되었습니다`);
        setIsDeleteConfirmOpen(false);
        handleClose();
      },
      onError: () => {
        toast.error("삭제 실패", "삭제 중 오류가 발생했습니다");
        setIsDeleteConfirmOpen(false);
      },
    });
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

    const validationError = getRecurrenceValidationError(
      recurrenceValue,
      startAtWatch ?? null,
      dueAtWatch ?? null,
    );
    if (validationError) {
      toast.error("입력 확인", validationError);
      return;
    }

    const dueAtIso = data.dueAt ? new Date(data.dueAt).toISOString() : null;
    const newRecurrence = toRecurrenceRule(recurrenceValue, dueAtIso);
    const updatedFields = {
      ...todo,
      ...data,
      startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
      dueAt: dueAtIso,
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
              <LabelRow>
                <Label htmlFor="todo-detail-description">설명</Label>
                {descriptionLinks.length > 0 && (
                  <DescriptionLinkAction links={descriptionLinks} />
                )}
              </LabelRow>
              <DescriptionField $highlight={hasDescriptionHighlight}>
                {hasDescriptionHighlight && (
                  // 실제 콘텐츠는 아래 textarea가 갖고 있다. 오버레이는 순수 장식이므로
                  // 스크린리더에는 같은 본문이 두 번 읽히지 않도록 숨긴다.
                  <DescriptionOverlay aria-hidden="true">
                    {descriptionSegments.map((segment, index) =>
                      segment.isLink ? (
                        <OverlayLink key={index}>{segment.text}</OverlayLink>
                      ) : (
                        <Fragment key={index}>{segment.text}</Fragment>
                      )
                    )}
                    {/* textarea는 끝의 개행 뒤 빈 줄을 렌더하지만 div는 접는다.
                        폭 0 문자를 붙여 마지막 줄 높이를 textarea와 맞춘다. */}
                    {"​"}
                  </DescriptionOverlay>
                )}
                <TextArea
                  {...descriptionField}
                  ref={setDescriptionTextArea}
                  id="todo-detail-description"
                  placeholder="상세 설명을 입력하세요"
                />
              </DescriptionField>
              {errors.description && (
                <ErrorText>{errors.description.message}</ErrorText>
              )}
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
                  startAt={startAtWatch ?? null}
                  dueAt={dueAtWatch ?? null}
                  value={recurrenceValue}
                  onChange={setRecurrenceValue}
                />
              </FormGroup>
            )}

            {!todo.parentId && (
              <FormGroup>
                <SubtaskSectionHeader>
                  <SubtaskLabelGroup>
                    <Label>하위 할 일</Label>
                    <SubtaskCountBadge>{subtaskInfo.total}</SubtaskCountBadge>
                  </SubtaskLabelGroup>
                  <SubtaskHeaderActions>
                    <SubtaskIconButton
                      type="button"
                      onClick={() => setIsAddChildOpen(true)}
                      disabled={todo.recurrence != null}
                      aria-disabled={todo.recurrence != null}
                      title={
                        todo.recurrence != null
                          ? "반복 할 일에는 하위 작업을 추가할 수 없습니다"
                          : undefined
                      }
                      aria-label="하위 할 일 추가"
                    >
                      <Plus size={16} />
                    </SubtaskIconButton>
                    {childTodos.length > 0 && (
                      <SubtaskIconButton
                        type="button"
                        onClick={() => setIsSubtaskExpanded((prev) => !prev)}
                        aria-label={
                          isSubtaskExpanded ? "하위 할 일 접기" : "하위 할 일 펼치기"
                        }
                      >
                        {isSubtaskExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </SubtaskIconButton>
                    )}
                  </SubtaskHeaderActions>
                </SubtaskSectionHeader>

                {isSubtaskExpanded && childTodos.length === 0 && (
                  <>
                    <EmptyChildMessage>하위 항목이 없습니다</EmptyChildMessage>
                    <EmptyChildAddButton
                      type="button"
                      onClick={() => setIsAddChildOpen(true)}
                      disabled={todo.recurrence != null}
                    >
                      + 첫 하위 할 일 추가
                    </EmptyChildAddButton>
                  </>
                )}

                {isSubtaskExpanded && childTodos.length > 0 && (
                  <>
                    <ProgressBar>
                      <ProgressFill $progress={progress} />
                    </ProgressBar>
                    <SubtaskListContainer>
                      {childTodos.map((childTodo) => (
                        <ChildTodoCard
                          key={childTodo.id}
                          todo={childTodo}
                          onEdit={handleEditChild}
                        />
                      ))}
                    </SubtaskListContainer>
                  </>
                )}
              </FormGroup>
            )}
          </FormContainer>
        </PanelContent>

        <PanelFooter>
          <Button
            type="button"
            $variant="danger"
            onClick={() => setIsDeleteConfirmOpen(true)}
            aria-label="할 일 삭제"
          >
            <Trash2 size={16} />
            삭제
          </Button>
          <PanelFooterActions>
            <Button type="button" onClick={handleClose}>
              취소
            </Button>
            <Button type="submit" form="todo-detail-form" $variant="primary">
              저장
            </Button>
          </PanelFooterActions>
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

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title="할 일 삭제"
        message={
          todo.recurrenceId
            ? `"${todo.title}"은(는) 반복 일정입니다.\n\n삭제하면 이 반복 시리즈의 모든 일정이 함께 삭제됩니다.`
            : `"${todo.title}"을(를) 삭제하시겠습니까?`
        }
        confirmText="삭제"
        cancelText="취소"
        confirmDisabled={useDeleteTodo.isPending || useDeleteRecurringSeries.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      <Modal isOpen={isAddChildOpen} setIsOpen={setIsAddChildOpen}>
        <TodoForm parentId={todo.id} onClose={() => setIsAddChildOpen(false)} />
      </Modal>

      <Modal isOpen={isEditChildOpen} setIsOpen={setIsEditChildOpen}>
        <TodoForm
          todo={editingChildTodo || undefined}
          onClose={() => setIsEditChildOpen(false)}
        />
      </Modal>
    </>
  );
};

/**
 * 라우트 파라미터만 바뀌면(예: 하위 할 일 카드 클릭 → navigate(`/todo/${child.id}`))
 * React Router는 같은 엘리먼트를 재사용하므로 컴포넌트가 **재마운트되지 않는다**.
 * 그러면 useForm의 values만 다음 todo로 갈아끼워지는데, resetOptions.keepDirtyValues가
 * 이전 todo에서 편집 중이던 값을 그대로 들고 가버린다 — 그 상태로 저장하면 A의 설명이
 * B에 덮어써진다.
 *
 * id를 key로 줘서 다른 todo로 이동하면 폼 상태를 새로 시작하게 한다.
 */
const TodoDetail = () => {
  const { id } = useParams<{ id: string }>();
  return <TodoDetailView key={id} id={id!} />;
};

export default TodoDetail;

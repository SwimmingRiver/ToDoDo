import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTodo, TodoForm } from "@/features/todo";
import type { Todo } from "@/features/todo";
import type { EventInput, EventClickArg, EventContentArg } from "@fullcalendar/core/index.js";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import {
  CalendarContainer,
  DayDetailList,
  DayDetailItem,
  DayDetailTitleRow,
  DayDetailTitle,
  DayDetailDate,
  DayDetailRecurrenceCaption,
  EventContentWrapper,
  EmptyMessage,
  ViewToggleRow,
  ViewButton,
  AddButton,
} from "./calendar.styles";
import { statusColors, type Status } from "../../../styles/statusColors";
import { BottomSheet, EmptyState, Modal, RecurrenceBadge, useToast } from "@/shared";
import { AlertCircle, Plus, Repeat } from "lucide-react";
import styled, { keyframes } from "styled-components";
import { colors } from "@/styles/colors";
import { isOverdue } from "../utils/calendarUtils";
import { formatRecurrenceSummary } from "@/features/todo/utils/recurrenceSummary";

const statusLabels: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

/** Date → "YYYY-MM-DD" 로컬 날짜 문자열 변환 (UTC 변환 없음) */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const Calendar = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { useGetTodos, useUpdateTodoDueAt } = useTodo();
  const { data: todos, isLoading, isError } = useGetTodos;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<"dayGridMonth" | "dayGridWeek">("dayGridMonth");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const toast = useToast();

  const events = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return todos
      ?.filter((todo: Todo) => todo.startAt !== null || todo.dueAt !== null)
      .map((todo: Todo) => {
        const overdue =
          todo.dueAt !== null &&
          new Date(todo.dueAt) < today &&
          todo.status !== "done";

        // FullCalendar all-day 형식 (date-only 문자열)
        // end는 배타적이므로 dueAt 다음 날로 설정해야 dueAt 당일이 표시됨
        const startDate = (todo.startAt ?? todo.dueAt ?? null)?.split("T")[0] ?? null;
        let endDate: string | null = null;
        if (todo.startAt && todo.dueAt) {
          const [y, mo, d] = todo.dueAt.split("T")[0].split("-").map(Number);
          endDate = toLocalDateStr(new Date(y, mo - 1, d + 1));
        }

        return {
          id: todo.id,
          title: todo.title,
          start: startDate,
          end: endDate,
          color: overdue
            ? colors.danger.main
            : (statusColors[todo.status as Status]?.main ?? statusColors.todo.main),
          // 반복 인스턴스는 드래그로 dueAt을 바꾸면 "시리즈 전체 수정" 정책(확인 모달,
          // 날짜 중복 방지)을 모두 우회해 단일 문서만 어긋나게 되므로 드래그를 막는다.
          // 날짜를 바꾸려면 반드시 폼을 통한 시리즈 수정 플로우를 거쳐야 한다.
          editable: todo.recurrenceId == null,
          extendedProps: {
            status: todo.status,
            overdue,
            isRecurring: todo.recurrenceId != null,
          },
        };
      });
  }, [todos]);

  const renderEventContent = useCallback((arg: EventContentArg) => (
    <EventContentWrapper>
      {arg.event.extendedProps.isRecurring && (
        <Repeat size={10} color="#ffffff" aria-hidden="true" />
      )}
      <span>{arg.event.title}</span>
    </EventContentWrapper>
  ), []);

  const selectedDateTodos = useMemo(() => {
    if (!selectedDate || !todos) return [];
    const selected = new Date(selectedDate);

    return todos.filter((todo: Todo) => {
      if (!todo.startAt && !todo.dueAt) return false;

      const start = todo.startAt ? new Date(todo.startAt.split("T")[0]) : null;
      const end = todo.dueAt ? new Date(todo.dueAt.split("T")[0]) : null;

      // 시작일만 있는 경우
      if (start && !end) return start.getTime() === selected.getTime();
      // 종료일만 있는 경우
      if (!start && end) return end.getTime() === selected.getTime();
      // 둘 다 있는 경우: 시작일 <= 선택일 <= 종료일
      if (start && end) return selected >= start && selected <= end;

      return false;
    });
  }, [selectedDate, todos]);

  const handleDateClick = useCallback((info: DateClickArg) => {
    setSelectedDate(info.dateStr);
    setIsBottomSheetOpen(true);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    navigate(`/todo/${info.event.id}`);
  }, [navigate]);

  const handleEventDrop = useCallback((info: EventDropArg) => {
    const todo = todos?.find((t: Todo) => t.id === info.event.id);
    if (!todo) {
      info.revert();
      return;
    }

    // 이벤트 자체에 editable: false를 부여해 두었지만, 방어적으로 한 번 더 막는다.
    // 반복 인스턴스는 단일 문서 드래그로 dueAt을 바꾸면 시리즈 수정 정책(확인 모달,
    // 날짜 중복 방지)을 우회하게 된다.
    if (todo.recurrenceId) {
      info.revert();
      toast.error(
        "변경 불가",
        "반복 할 일의 날짜는 드래그로 바꿀 수 없습니다. 수정 화면에서 변경해주세요",
      );
      return;
    }

    // FC end는 배타적(+1일)이므로 실제 dueAt은 하루 전
    let newDueAt: string | null = null;
    if (info.event.end) {
      const d = new Date(info.event.end);
      d.setDate(d.getDate() - 1);
      newDueAt = `${toLocalDateStr(d)}T00:00`;
    } else if (info.event.start) {
      newDueAt = `${toLocalDateStr(info.event.start)}T00:00`;
    }

    // startAt이 있는 다중일 이벤트 드래그 시 startAt도 함께 갱신
    let newStartAt: string | null | undefined = undefined;
    if (todo.startAt && info.event.start) {
      newStartAt = `${toLocalDateStr(info.event.start)}T00:00`;
    }

    useUpdateTodoDueAt.mutate(
      { id: todo.id, dueAt: newDueAt, startAt: newStartAt },
      {
        onError: () => {
          info.revert();
          toast.error("저장 실패", "할 일 날짜 변경 중 오류가 발생했습니다");
        },
      }
    );
  }, [todos, useUpdateTodoDueAt, toast]);

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().changeView(calendarView);
    }
  }, [calendarView]);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.updateSize();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <LoadingWrapper>
        <Spinner />
      </LoadingWrapper>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="캘린더 데이터를 불러오지 못했습니다"
        description="네트워크 연결을 확인하고 다시 시도해주세요"
      />
    );
  }

  return (
    <>
      <CalendarContainer ref={containerRef}>
        <ViewToggleRow role="group" aria-label="캘린더 뷰 전환">
          <ViewButton
            $active={calendarView === "dayGridMonth"}
            onClick={() => setCalendarView("dayGridMonth")}
            aria-pressed={calendarView === "dayGridMonth"}
          >
            월간
          </ViewButton>
          <ViewButton
            $active={calendarView === "dayGridWeek"}
            onClick={() => setCalendarView("dayGridWeek")}
            aria-pressed={calendarView === "dayGridWeek"}
          >
            주간
          </ViewButton>
        </ViewToggleRow>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView={calendarView}
          events={events as EventInput[]}
          height="100%"
          displayEventTime={false}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          editable={true}
          eventDrop={handleEventDrop}
          longPressDelay={1000}
        />
      </CalendarContainer>

      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        title={selectedDate ? new Date(selectedDate).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }) : ""}
      >
        {selectedDateTodos.length > 0 ? (
          <DayDetailList>
            {selectedDateTodos.map((todo: Todo) => (
              <DayDetailItem
                key={todo.id}
                $color={isOverdue(todo) ? colors.danger.main : (statusColors[todo.status as Status]?.main ?? statusColors.todo.main)}
                $overdue={isOverdue(todo)}
              >
                <DayDetailTitleRow>
                  <DayDetailTitle>{todo.title}</DayDetailTitle>
                  {todo.recurrenceId != null && <RecurrenceBadge />}
                </DayDetailTitleRow>
                <DayDetailDate>
                  {statusLabels[todo.status as Status]}
                  {todo.startAt && ` · 시작: ${formatDate(todo.startAt)}`}
                  {todo.dueAt && ` · 마감: ${formatDate(todo.dueAt)}`}
                </DayDetailDate>
                {todo.recurrenceId != null && todo.recurrence && (
                  <DayDetailRecurrenceCaption>
                    {formatRecurrenceSummary(todo.recurrence, todo.dueAt)}
                  </DayDetailRecurrenceCaption>
                )}
              </DayDetailItem>
            ))}
          </DayDetailList>
        ) : (
          <EmptyMessage>이 날짜에 할 일이 없습니다</EmptyMessage>
        )}
        <AddButton
          onClick={() => setIsCreateModalOpen(true)}
          aria-label={`${selectedDate ?? ""} 날짜에 새 할 일 추가`}
        >
          <Plus size={16} />
          이 날짜에 할 일 추가
        </AddButton>
      </BottomSheet>

      <Modal isOpen={isCreateModalOpen} setIsOpen={setIsCreateModalOpen}>
        <TodoForm
          initialDueAt={selectedDate ? `${selectedDate}T00:00` : undefined}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </Modal>
    </>
  );
};

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const LoadingWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: ${colors.brand.secondary};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

export default Calendar;

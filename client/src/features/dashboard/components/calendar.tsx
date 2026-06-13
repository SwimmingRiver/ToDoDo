import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTodo } from "@/features/todo";
import type { Todo } from "@/features/todo";
import type { EventInput } from "@fullcalendar/core/index.js";
import type { DateClickArg } from "@fullcalendar/interaction";
import {
  CalendarContainer,
  DayDetailList,
  DayDetailItem,
  DayDetailTitle,
  DayDetailDate,
  EmptyMessage,
} from "./calendar.styles";
import { statusColors, type Status } from "../../../styles/statusColors";
import { BottomSheet, EmptyState } from "@/shared";
import { AlertCircle } from "lucide-react";
import styled, { keyframes } from "styled-components";

const statusLabels: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

const Calendar = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { useGetTodos } = useTodo();
  const { data: todos, isLoading, isError } = useGetTodos;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const events = useMemo(() => {
    return todos
      ?.filter((todo: Todo) => todo.startAt !== null || todo.dueAt !== null)
      .map((todo: Todo) => ({
        id: todo.id,
        title: todo.title,
        start: todo.startAt ?? null,
        end: todo.dueAt ?? null,
        color: statusColors[todo.status as Status]?.main ?? statusColors.todo.main,
        extendedProps: {
          status: todo.status,
        },
      }));
  }, [todos]);

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
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events as EventInput[]}
          height="100%"
          displayEventTime={false}
          dateClick={handleDateClick}
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
                $color={statusColors[todo.status as Status]?.main ?? statusColors.todo.main}
              >
                <DayDetailTitle>{todo.title}</DayDetailTitle>
                <DayDetailDate>
                  {statusLabels[todo.status as Status]}
                  {todo.startAt && ` · 시작: ${formatDate(todo.startAt)}`}
                  {todo.dueAt && ` · 마감: ${formatDate(todo.dueAt)}`}
                </DayDetailDate>
              </DayDetailItem>
            ))}
          </DayDetailList>
        ) : (
          <EmptyMessage>이 날짜에 할 일이 없습니다</EmptyMessage>
        )}
      </BottomSheet>
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
  border-top-color: #1c72eb;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

export default Calendar;

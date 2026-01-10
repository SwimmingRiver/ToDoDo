import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { useEffect, useMemo, useRef } from "react";
import { useTodo } from "@/features/todo";
import type { Todo } from "@/features/todo";
import type { EventInput } from "@fullcalendar/core/index.js";
import { CalendarContainer } from "./calendar.styles";

const Calendar = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { useGetTodos } = useTodo();
  const { data: todos } = useGetTodos;
  const events = useMemo(() => {
    return todos
      ?.filter((todo: Todo) => todo.startAt !== null || todo.dueAt !== null)
      .map((todo: Todo) => ({
        title: todo.title,
        start: todo.startAt ?? null,
        end: todo.dueAt ?? null,
        color:
          todo.status === "todo"
            ? "#FF8042"
            : todo.status === "doing"
            ? "#FFBB28"
            : "#00C49F",
      }));
  }, [todos]);

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

  return (
    <CalendarContainer ref={containerRef}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        events={events as EventInput[]}
        height="100%"
        displayEventTime={false}
        aspectRatio={0}
      />
    </CalendarContainer>
  );
};

export default Calendar;

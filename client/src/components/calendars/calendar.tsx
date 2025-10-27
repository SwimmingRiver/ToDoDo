import { styled } from "styled-components";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { useEffect, useRef } from "react";

const CalendarContainer = styled.div`
  width: 100%;
  height: 100%;
`;

const events = [
  {
    title: "팀 회의",
    start: "2025-10-23",
    color: "#3788d8",
  },
  {
    title: "프로젝트 마감",
    start: "2025-10-25",
    color: "#ff6b6b",
  },
  {
    title: "코드 리뷰",
    start: "2025-10-27T10:00:00",
    end: "2025-10-27T12:00:00",
    color: "#51cf66",
  },
  {
    title: "런치 미팅",
    start: "2025-10-28T12:00:00",
    end: "2025-10-28T13:00:00",
    color: "#ffd43b",
  },
  {
    title: "개발 스프린트",
    start: "2025-10-29",
    end: "2025-10-31",
    color: "#a78bfa",
  },
];

const Calendar = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        events={events}
        height="100%"
        aspectRatio={0}
      />
    </CalendarContainer>
  );
};

export default Calendar;

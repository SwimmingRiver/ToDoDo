import type { DayMarker } from "../hooks/useTodayTodos";
import { getWeekDates, isSameLocalDay, toDateKey } from "@/shared/utils/date";
import {
  Container,
  DayCell,
  DayLabel,
  DateLabel,
  Dot,
} from "./weekStrip.styles";

const WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

interface WeekStripProps {
  selectedDate: string;
  markers: Record<string, DayMarker>;
  onSelectDate: (date: string) => void;
}

const WeekStrip = ({ selectedDate, markers, onSelectDate }: WeekStripProps) => {
  const today = new Date();
  const weekDates = getWeekDates(selectedDate);

  return (
    <Container role="list" aria-label="주간 날짜 선택">
      {weekDates.map((date) => {
        const dateKey = toDateKey(date);
        const isSelected = dateKey === selectedDate;
        const isToday = isSameLocalDay(date, today);
        const marker = markers[dateKey] ?? "none";
        const weekdayShort = WEEKDAY_SHORT_LABELS[date.getDay()];
        const weekdayFull = WEEKDAY_FULL_LABELS[date.getDay()];

        const scheduleInfo =
          marker === "danger"
            ? "마감 위험 일정 있음"
            : marker === "normal"
              ? "일정 있음"
              : "일정 없음";

        return (
          <DayCell
            key={dateKey}
            role="button"
            tabIndex={0}
            $isSelected={isSelected}
            $isToday={isToday}
            aria-pressed={isSelected}
            aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayFull}, ${scheduleInfo}`}
            onClick={() => onSelectDate(dateKey)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectDate(dateKey);
              }
            }}
          >
            <DayLabel $isSelected={isSelected}>{weekdayShort}</DayLabel>
            <DateLabel $isSelected={isSelected} $isToday={isToday}>
              {date.getDate()}
            </DateLabel>
            <Dot $marker={marker} $onColoredBackground={isSelected} />
          </DayCell>
        );
      })}
    </Container>
  );
};

export default WeekStrip;

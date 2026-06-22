import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayMarker } from "../hooks/useTodayTodos";
import { getStripDates, isSameLocalDay, toDateKey } from "@/shared/utils/date";
import {
  Container,
  StripScroll,
  ArrowButton,
  TodayChip,
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
  windowStart: string;
  markers: Record<string, DayMarker>;
  onSelectDate: (date: string) => void;
  onShiftLeft: () => void;
  onShiftRight: () => void;
  onGoToToday: () => void;
}

const WeekStrip = ({
  selectedDate,
  windowStart,
  markers,
  onSelectDate,
  onShiftLeft,
  onShiftRight,
  onGoToToday,
}: WeekStripProps) => {
  const today = new Date();
  const stripDates = getStripDates(windowStart);
  const isTodayInStrip = stripDates.some((d) => isSameLocalDay(d, today));

  return (
    <Container>
      <ArrowButton onClick={onShiftLeft} aria-label="이전 날짜">
        <ChevronLeft size={16} />
      </ArrowButton>
      <StripScroll aria-label="날짜 선택">
        {stripDates.map((date) => {
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
      </StripScroll>
      <ArrowButton onClick={onShiftRight} aria-label="다음 날짜">
        <ChevronRight size={16} />
      </ArrowButton>
      <TodayChip
        onClick={onGoToToday}
        aria-label="오늘로 이동"
        style={{ visibility: isTodayInStrip ? "hidden" : "visible" }}
      >
        오늘
      </TodayChip>
    </Container>
  );
};

export default WeekStrip;

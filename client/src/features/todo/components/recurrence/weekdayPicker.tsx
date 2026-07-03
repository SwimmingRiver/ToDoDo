import { WeekdayGroup, DayChip, DayChipCircle, ErrorText } from "./recurrence.styles";
import { WEEKDAY_LABELS, WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";

interface WeekdayPickerProps {
  selected: number[]; // 0=일 ~ 6=토
  onToggle: (day: number) => void;
  error?: boolean; // 0개 선택 시 true
}

const WeekdayPicker = ({ selected, onToggle, error }: WeekdayPickerProps) => (
  <div>
    <WeekdayGroup role="group" aria-label="반복 요일 선택">
      {WEEKDAY_LABELS.map((label, day) => (
        <DayChip
          key={day}
          type="button"
          aria-pressed={selected.includes(day)}
          onClick={() => onToggle(day)}
        >
          <DayChipCircle $selected={selected.includes(day)}>{label}</DayChipCircle>
        </DayChip>
      ))}
    </WeekdayGroup>
    {error && <ErrorText role="alert">{WEEKDAY_REQUIRED_ERROR}</ErrorText>}
  </div>
);

export default WeekdayPicker;
export type { WeekdayPickerProps };

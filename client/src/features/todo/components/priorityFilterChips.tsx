import type { TodoPriority } from "@tododo/core/dist/todoFilter/index.js";
import { ChipRow, Chip } from "./priorityFilterChips.styles";

const CHIPS: readonly { value: TodoPriority; label: string }[] = [
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
];

interface PriorityFilterChipsProps {
  selected: readonly TodoPriority[];
  onToggle: (priority: TodoPriority) => void;
}

export const PriorityFilterChips = ({ selected, onToggle }: PriorityFilterChipsProps) => (
  <ChipRow>
    {CHIPS.map(({ value, label }) => (
      <Chip
        key={value}
        type="button"
        aria-pressed={selected.includes(value)}
        onClick={() => onToggle(value)}
      >
        {label}
      </Chip>
    ))}
  </ChipRow>
);

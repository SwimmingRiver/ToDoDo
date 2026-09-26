import { X } from "lucide-react";
import type { DraftItem, DraftFields } from "../hooks";
import { Row, TextInput, Select, IconButton } from "./aiPlanModal.styles";
import { PRIORITY_LABELS } from "./priorityLabels";

interface PlanItemRowProps {
  item: DraftItem;
  today: string;
  onChange: (patch: Partial<DraftFields>) => void;
  onToggle: () => void;
  onRemove: () => void;
}

const PlanItemRow = ({ item, today, onChange, onToggle, onRemove }: PlanItemRowProps) => {
  const label = item.title.trim() || "새 항목";
  return (
    <Row>
      <input type="checkbox" checked={item.checked} onChange={onToggle} aria-label={`${label} 포함`} />
      <TextInput
        value={item.title}
        onChange={(e) => onChange({ title: e.target.value })}
        maxLength={100}
        placeholder="할 일 제목"
        aria-label={`${label} 제목`}
      />
      <TextInput
        type="date"
        value={item.dueDate ?? ""}
        min={today}
        onChange={(e) => onChange({ dueDate: e.target.value || null })}
        aria-label={`${label} 마감일`}
      />
      <Select
        value={item.priority}
        onChange={(e) => onChange({ priority: e.target.value as DraftFields["priority"] })}
        aria-label={`${label} 우선순위`}
      >
        {(["high", "medium", "low"] as const).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </Select>
      <IconButton type="button" onClick={onRemove} aria-label={`${label} 삭제`}>
        <X size={16} />
      </IconButton>
    </Row>
  );
};

export default PlanItemRow;

import { Repeat } from "lucide-react";
import { Badge } from "./recurrenceBadge.styles";

interface RecurrenceBadgeProps {
  /** true면 아이콘만(스크린리더용 aria-label 필수), false(기본)면 "반복" 텍스트 포함 */
  compact?: boolean;
}

/**
 * 반복 할 일임을 나타내는 배지. kanban 카드, 캘린더 BottomSheet 등 여러 피처에서
 * 공통으로 사용하므로 shared/ui에 둔다 (recurringTodo.spec.md 3-3절 근거).
 */
const RecurrenceBadge = ({ compact = false }: RecurrenceBadgeProps) => (
  <Badge aria-label={compact ? "반복 할 일" : undefined}>
    <Repeat size={12} aria-hidden="true" />
    {!compact && <span>반복</span>}
  </Badge>
);

export default RecurrenceBadge;
export type { RecurrenceBadgeProps };

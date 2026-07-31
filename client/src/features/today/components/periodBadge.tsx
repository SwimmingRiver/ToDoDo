import { Badge } from "./periodBadge.styles";

interface PeriodBadgeProps {
  /** 1부터 시작하는 진행 일차 */
  dayIndex: number;
  /** startAt~dueAt 총 일수(양 끝 포함) */
  totalDays: number;
}

/**
 * 기간(startAt~dueAt) 항목이 매일 노출될 때 "오늘이 며칠째인지" 보여주는 정보 칩.
 * 브랜드 그린(RecurrenceBadge)과 달리 중립 회색을 써서 "완료"와의 오인, 마감 임박
 * 배지(주황/빨강)와의 위계 혼동을 피한다(design/spec.md 참고).
 */
const PeriodBadge = ({ dayIndex, totalDays }: PeriodBadgeProps) => (
  <Badge>{`${dayIndex}/${totalDays}일차`}</Badge>
);

export default PeriodBadge;
export type { PeriodBadgeProps };

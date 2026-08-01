import { Badge } from "./recurrenceMissedBadge.styles";

interface RecurrenceMissedBadgeProps {
  /** 같은 반복 시리즈에서 조용히 archived 처리된(overdueArchived) 지난 회차 수 */
  count: number;
}

/**
 * 반복 할 일의 대표 카드 옆에, 같은 시리즈에서 사용자 모르게 건너뛴(overdueArchived)
 * 지난 회차가 몇 건인지 보여주는 배지. collapseRecurringInstances가 이 인스턴스들을
 * 화면에서 완전히 숨기기 때문에(recurringOverdueArchiving 스펙), 일반 투두의
 * OverdueBadge("N일 초과")와 같은 목적으로 반복 투두 쪽에 최소한의 신호를 남긴다.
 * count가 0 이하면 아무것도 렌더링하지 않는다 — 호출부에서 조건부로 감싸지 않아도
 * 안전하도록 컴포넌트 자체에서 가드한다.
 */
const RecurrenceMissedBadge = ({ count }: RecurrenceMissedBadgeProps) => {
  if (count <= 0) return null;

  return <Badge>{count}회 밀림</Badge>;
};

export default RecurrenceMissedBadge;
export type { RecurrenceMissedBadgeProps };

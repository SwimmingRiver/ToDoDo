import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

// shared/ui/recurrenceBadge의 Badge와 동일한 padding/radius/font-size 패턴을
// 색만 중립 회색으로 교체해 재정의한다(피처 간 직접 의존을 최소화하기 위해
// recurrenceBadge를 import해 override하지 않고 today 피처 로컬에 둔다).
export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: ${radius.md};
  background: ${colors.background.secondary};
  color: ${colors.text.secondary};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
`;

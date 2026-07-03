import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

// projectCard.styles.tsx의 OverdueBadge와 동일한 시각 패턴(padding/폰트/라운딩)을
// 색상만 교체해 재정의한다 (todo 피처 전용 컴포넌트를 shared에서 직접 import하지 않기 위함).
export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: ${radius.md};
  background: ${colors.brand.background};
  color: ${colors.brand.primary};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
`;

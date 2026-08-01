import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

// projectCard.styles.tsx의 OverdueBadge와 동일한 시각 패턴(padding/폰트/라운딩/색상)을
// 그대로 따른다 — 둘 다 "마감이 지났다"는 동일한 톤의 경고 신호이기 때문이다
// (recurringMissedCount.spec 근거: 최소 버전은 순수 정보 표시).
export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: ${radius.md};
  background: ${colors.danger.background};
  color: ${colors.danger.text};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
`;

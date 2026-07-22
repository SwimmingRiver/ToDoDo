import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 4px;
  border-radius: ${radius.md};
  background-color: ${colors.brand.background};
  color: ${colors.brand.primary};
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const CardDescription = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: ${colors.text.secondary};
`;

// recurrenceBadge의 pill 패턴(border-radius: full, font-size: 11px, padding: 2px 8px)을
// 동일하게 따르되 카피만 다른 배지 — "로그인 후 이용 가능" 기대치 안내용.
const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${radius.full};
  background-color: ${colors.brand.background};
  color: ${colors.brand.primary};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
`;

export { Card, IconWrapper, TitleRow, CardTitle, CardDescription, Badge };

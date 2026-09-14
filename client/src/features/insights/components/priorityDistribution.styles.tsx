import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

/** 텍스트가 범주(우선순위)를 나타낸다 — 막대는 단일 색상으로 크기(개수)만 인코딩한다. */
const RowLabel = styled.span`
  width: 40px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: ${colors.text.secondary};
`;

const BarTrack = styled.div`
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background-color: ${colors.background.secondary};
  overflow: hidden;
`;

const BarFill = styled.div`
  height: 100%;
  border-radius: 4px;
  background-color: ${colors.brand.fill};
  transition: width 0.2s ease;
`;

const RowCount = styled.span`
  width: 24px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
  color: ${colors.text.primary};
`;

export { Card, Title, Row, RowLabel, BarTrack, BarFill, RowCount };

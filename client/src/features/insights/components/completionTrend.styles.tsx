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

const ChartRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 96px;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 100%;
`;

const BarTrack = styled.div`
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 72px;
`;

const Bar = styled.div`
  width: 100%;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
  background-color: ${colors.brand.fill};
`;

const DateLabel = styled.span`
  font-size: 10px;
  color: ${colors.text.tertiary};
  white-space: nowrap;
`;

export { Card, Title, ChartRow, Column, BarTrack, Bar, DateLabel };

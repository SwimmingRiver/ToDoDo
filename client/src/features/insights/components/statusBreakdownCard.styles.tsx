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

const ChartArea = styled.div`
  width: 100%;
  min-width: 0;
`;

const Legend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const LegendItem = styled.li`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

const LegendDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $color }) => $color};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.tertiary};
`;

export { Card, Title, ChartArea, Legend, LegendItem, LegendDot, Hint };

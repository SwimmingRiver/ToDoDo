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

/** SVG가 이 요소의 측정 너비를 따라간다. */
const ChartArea = styled.div`
  width: 100%;
  min-width: 0;
`;

export { Card, Title, ChartArea };

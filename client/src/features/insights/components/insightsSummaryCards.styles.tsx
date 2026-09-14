import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Label = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${colors.text.secondary};
`;

const Value = styled.span`
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const Sub = styled.span`
  font-size: 12px;
  font-weight: 400;
  color: ${colors.text.tertiary};
`;

export { Grid, Card, Label, Value, Sub };

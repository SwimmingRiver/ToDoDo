import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${radius.md};
  background-color: ${colors.brand.tint};
  color: ${colors.brand.strong};
  flex-shrink: 0;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Value = styled.span`
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const Label = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${colors.text.secondary};
`;

export { Card, IconWrapper, Content, Value, Label };

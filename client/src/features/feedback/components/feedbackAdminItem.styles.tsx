import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

const Content = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${colors.text.primary};
  white-space: pre-wrap;
  word-break: break-word;
`;

const StatusSelect = styled.select`
  align-self: flex-start;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  color: ${colors.text.primary};
  background-color: ${colors.background.primary};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
`;

export { Card, Meta, Content, StatusSelect };

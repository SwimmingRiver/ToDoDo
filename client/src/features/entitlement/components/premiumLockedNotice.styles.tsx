import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Wrapper = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "6px" : "12px")};
  ${({ $compact }) =>
    !$compact &&
    `
    align-items: flex-start;
    padding: 16px;
    border: 1px solid ${colors.border.tertiary};
    border-radius: ${radius.md};
    background-color: ${colors.background.secondary};
  `}
`;

const IconWrapper = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${colors.brand.strong};
  ${({ $compact }) =>
    $compact
      ? ""
      : `
    width: 32px;
    height: 32px;
    border-radius: ${radius.md};
    background-color: ${colors.brand.tint};
  `}
`;

const Content = styled.div<{ $compact?: boolean }>`
  display: flex;
  flex-direction: ${({ $compact }) => ($compact ? "row" : "column")};
  align-items: ${({ $compact }) => ($compact ? "center" : "stretch")};
  gap: ${({ $compact }) => ($compact ? "8px" : "4px")};
  min-width: 0;
  ${({ $compact }) => !$compact && "flex: 1;"}
`;

const Title = styled.p<{ $compact?: boolean }>`
  margin: 0;
  font-size: ${({ $compact }) => ($compact ? "13px" : "14px")};
  font-weight: 600;
  color: ${colors.text.primary};
  white-space: nowrap;
`;

const Description = styled.p`
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  color: ${colors.text.secondary};
`;

const CtaButton = styled.button<{ $compact?: boolean }>`
  font-size: 13px;
  font-weight: 500;
  color: ${colors.brand.strong};
  cursor: pointer;
  white-space: nowrap;
  ${({ $compact }) =>
    $compact
      ? `
    padding: 0;
    border: none;
    background: none;
    text-decoration: underline;
  `
      : `
    align-self: flex-start;
    margin-top: 4px;
    padding: 6px 12px;
    border: 1px solid ${colors.brand.strong};
    border-radius: 6px;
    background-color: transparent;
    min-height: 32px;

    &:hover {
      background-color: ${colors.brand.tint};
    }
  `}
`;

export { Wrapper, IconWrapper, Content, Title, Description, CtaButton };

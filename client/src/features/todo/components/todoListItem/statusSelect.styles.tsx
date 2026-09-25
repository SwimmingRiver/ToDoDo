import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const StatusButton = styled.button<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background-color: ${colors.background.secondary};
  border: 1px solid ${colors.border.tertiary};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: ${colors.text.primary};
  font-size: 13px;
  flex-shrink: 0;

  &:hover {
    background-color: color-mix(in srgb, ${colors.text.primary} 6%, ${colors.background.secondary});
    border-color: ${colors.border.secondary};
  }

  &:active {
    background-color: ${colors.border.tertiary};
  }

  ${media.mobile} {
    padding: 4px 8px;
    font-size: 12px;
    gap: 4px;
  }
`;

const StatusIcon = styled.span<{ $color: string }>`
  display: flex;
  align-items: center;
  color: ${({ $color }) => $color};
`;

const StatusLabel = styled.span`
  ${media.mobile} {
    display: none;
  }
`;

export { StatusButton, StatusIcon, StatusLabel };

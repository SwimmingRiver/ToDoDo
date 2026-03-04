import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";

const StatusButton = styled.button<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background-color: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #495057;
  font-size: 13px;
  flex-shrink: 0;

  &:hover {
    background-color: #f0f0f0;
    border-color: #d0d0d0;
  }

  &:active {
    background-color: #e8e8e8;
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

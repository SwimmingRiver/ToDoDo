import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const ChipRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const Chip = styled.button`
  height: 32px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid ${colors.border.tertiary};
  background: ${colors.background.secondary};
  color: ${colors.text.secondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${colors.brand.strong};
  }

  &[aria-pressed="true"] {
    background: ${colors.brand.tint};
    border-color: ${colors.brand.strong};
    color: ${colors.brand.strong};
  }
`;

export { ChipRow, Chip };

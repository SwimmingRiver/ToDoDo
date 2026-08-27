import { styled } from "styled-components";
import { colors } from "@/styles/colors";

export const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
`;

export const MenuList = styled.div`
  padding: 8px 0;
`;

export const MenuRow = styled.div`
  padding: 16px 20px;
  font-size: 16px;
  color: ${colors.text.primary};
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:active {
    background-color: ${colors.background.secondary};
  }
`;

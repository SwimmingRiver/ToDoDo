import styled from "styled-components";
import { colors } from "@/styles/colors";

export const Wrapper = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ConnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.brand.strong};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.brand.strong};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.brand.tint};
  }
`;

export const DisconnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.border.secondary};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.text.secondary};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.background.secondary};
  }
`;

export const RevokedNotice = styled.span`
  font-size: 12px;
  color: ${colors.danger.main};
`;

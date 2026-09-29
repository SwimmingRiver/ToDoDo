import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export { Wrapper, Trigger } from "@/layouts/themeMenu/themeMenu.styles";

export const Panel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  width: 260px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: ${colors.surface.overlay};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
`;

export const StatusText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${colors.text.secondary};
`;

export const EnableButton = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: ${radius.sm};
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.strongHover};
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const DefaultSelect = styled.select`
  padding: 6px 8px;
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.sm};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  font-size: 14px;
`;

import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const Wrapper = styled.div`
  position: relative;
`;

export const Trigger = styled.button`
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  color: ${colors.text.secondary};
  cursor: pointer;

  &:hover {
    background-color: ${colors.background.secondary};
    color: ${colors.text.primary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  min-width: 140px;
  padding: 4px;
  list-style: none;
  background-color: ${colors.surface.overlay};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
`;

export const Item = styled.li<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: ${radius.sm};
  font-size: 14px;
  cursor: pointer;
  color: ${({ $checked }) => ($checked ? colors.brand.strong : colors.text.primary)};
  background-color: ${({ $checked }) => ($checked ? colors.brand.tint : "transparent")};
  font-weight: ${({ $checked }) => ($checked ? 600 : 400)};

  &:hover,
  &:focus-visible {
    outline: none;
    background-color: ${({ $checked }) =>
      $checked
        ? `color-mix(in srgb, ${colors.brand.strong} 12%, ${colors.brand.tint})`
        : colors.background.secondary};
  }
`;

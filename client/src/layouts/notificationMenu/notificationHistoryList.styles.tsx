import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const Heading = styled.h2`
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const ItemButton = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  column-gap: 8px;
  align-items: start;
  padding: 10px 8px;
  border: none;
  border-radius: ${radius.sm};
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: ${colors.background.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

export const TextBlock = styled.span`
  min-width: 0;
`;

export const UnreadDot = styled.span<{ $visible: boolean }>`
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background-color: ${({ $visible }) => ($visible ? colors.brand.strong : "transparent")};
`;

export const Title = styled.span`
  display: block;
  font-size: 14px;
  color: ${colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Meta = styled.span`
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const Message = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 88px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

const Fab = styled.button`
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 2;

  height: 48px;
  padding: 0 20px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: ${colors.brand.strong};
  color: white;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;

  &:hover {
    background-color: ${colors.brand.strongHover};
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0) scale(0.97);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }

  ${media.mobile} {
    bottom: 16px;
    right: 16px;
  }
`;

export { Container, ScrollArea, List, Fab };

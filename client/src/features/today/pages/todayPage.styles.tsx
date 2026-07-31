import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

const AddButton = styled.button`
  width: 100%;
  height: 48px;
  flex-shrink: 0;
  background-color: ${colors.brand.primary};
  color: white;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--border-radius-lg, 10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #0d5e49;
  }

  ${media.mobile} {
    height: 44px;
  }
`;

export { Container, ScrollArea, List, AddButton };

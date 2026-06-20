import { styled } from "styled-components";
import { media } from "./styles/breakpoints";

const Container = styled.div`
  height: 100vh;
  display: flex;
  flex-direction: column;
`;

const ModeTapContainer = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  background-color: #f1f3f4;
  border-radius: 8px;
  margin: 8px 16px;
  position: relative;

  ${media.mobile} {
    margin: 8px;
    justify-content: center;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: ${({ $active }) => ($active ? "#fff" : "transparent")};
  color: ${({ $active }) => ($active ? "#1a1a1a" : "#5f6368")};
  box-shadow: ${({ $active }) =>
    $active ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none"};
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background-color: ${({ $active }) => ($active ? "#fff" : "#e8eaed")};
  }

  ${media.mobile} {
    padding: 8px 12px;
    font-size: 13px;
    flex: 1;
    justify-content: center;
  }
`;

const Main = styled.main<{ $bottomInset?: number }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  flex: 1;
  padding-bottom: ${({ $bottomInset }) => ($bottomInset ? `${$bottomInset}px` : "0")};
`;

export { Container, ModeTapContainer, TabButton, Main };

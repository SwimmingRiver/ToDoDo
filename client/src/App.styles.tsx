import { styled } from "styled-components";

const Container = styled.div`
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100vh;
`;
const ModeTapContainer = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  background-color: #f1f3f4;
  border-radius: 8px;
  width: fit-content;
  margin: 8px 16px;
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

  &:hover {
    background-color: ${({ $active }) => ($active ? "#fff" : "#e8eaed")};
  }
`;

const Main = styled.main`
  overflow: auto;
`;

export { Container, ModeTapContainer, TabButton, Main };

import { styled } from "styled-components";
import { media } from "./styles/breakpoints";

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

  ${media.mobile} {
    margin: 8px;
    width: calc(100% - 16px);
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

const Main = styled.main`
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const MobileTabContainer = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e0e0e0;
  background-color: #fff;
`;

const MobileTabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: ${({ $active }) => ($active ? "#1c72eb" : "#5f6368")};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? "#1c72eb" : "transparent")};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    color: ${({ $active }) => ($active ? "#1c72eb" : "#1a1a1a")};
    background-color: #f8f9fa;
  }
`;

const MobileContent = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ContentWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export {
  Container,
  ModeTapContainer,
  TabButton,
  Main,
  MobileTabContainer,
  MobileTabButton,
  MobileContent,
  ContentWrapper,
};

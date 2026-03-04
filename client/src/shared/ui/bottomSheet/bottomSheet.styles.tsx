import { styled, keyframes } from "styled-components";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const slideUp = keyframes`
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
`;

const slideDown = keyframes`
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
`;

const Overlay = styled.div<{ $isClosing: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: ${({ $isClosing }) => ($isClosing ? fadeOut : fadeIn)} 0.2s ease forwards;

  @media (min-width: 481px) {
    align-items: center;
  }
`;

const Container = styled.div<{ $isClosing: boolean }>`
  width: 100%;
  background-color: #fff;
  border-radius: 16px 16px 0 0;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ${({ $isClosing }) => ($isClosing ? slideDown : slideUp)} 0.3s ease forwards;

  @media (min-width: 481px) {
    width: 400px;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }
`;

const Handle = styled.div`
  width: 36px;
  height: 4px;
  background-color: #e0e0e0;
  border-radius: 2px;
  margin: 12px auto;
  flex-shrink: 0;

  @media (min-width: 481px) {
    display: none;
  }
`;

const Header = styled.div`
  padding: 0 20px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;

  @media (min-width: 481px) {
    padding-top: 20px;
  }
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
`;

const Content = styled.div`
  padding: 8px 0;
  overflow-y: auto;
  flex: 1;
`;

const OptionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const OptionItem = styled.li<{ $selected?: boolean }>`
  padding: 16px 20px;
  font-size: 16px;
  color: ${({ $selected }) => ($selected ? "#1c72eb" : "#1a1a1a")};
  background-color: ${({ $selected }) => ($selected ? "#e8f0fe" : "transparent")};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background-color 0.15s ease;

  &:active {
    background-color: #f5f5f5;
  }
`;

const OptionLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const CancelButton = styled.button`
  width: 100%;
  padding: 16px;
  margin-top: 8px;
  border: none;
  border-top: 1px solid #f0f0f0;
  background-color: #fff;
  font-size: 16px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  flex-shrink: 0;

  &:active {
    background-color: #f5f5f5;
  }
`;

export {
  Overlay,
  Container,
  Handle,
  Header,
  Title,
  Content,
  OptionList,
  OptionItem,
  OptionLabel,
  CancelButton,
};

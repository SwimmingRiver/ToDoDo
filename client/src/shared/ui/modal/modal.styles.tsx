import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";
import { colors } from "@/styles/colors";

const ModalBackground = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: ${colors.scrim};
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;

  ${media.mobile} {
    align-items: flex-end;
  }
`;

const ModalContainer = styled.div`
  width: auto;
  min-width: 400px;
  height: auto;
  max-height: 80vh;
  padding: 16px;
  background-color: ${colors.surface.overlay};
  z-index: 1000;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  ${media.mobile} {
    width: 100%;
    min-width: unset;
    max-height: 90vh;
    border-radius: 12px 12px 0 0;
  }
`;

const ModalHeader = styled.div`
  flex: 0 0 50px;
  background-color: ${colors.surface.overlay};
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 10px;
`;

const ModalBody = styled.div`
  width: 100%;
  flex: 1 1 auto;
  background-color: ${colors.surface.overlay};
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  overflow-y: auto;
  box-sizing: border-box;
`;
const ModalFooter = styled.div`
  width: 100%;
  flex: 0 0 50px;
  background-color: ${colors.background.secondary};
`;
// todoDetail의 패널 닫기 버튼과 같은 모양 — 앱 전체 닫기 버튼을 하나로 맞춘다.
const ModalCloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.text.secondary};
  padding: 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.tint};
    color: ${colors.brand.strong};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;
const ModalSubmitButton = styled.button`
  width: 100%;
  height: 100%;
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
`;

export {
  ModalBackground,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  ModalSubmitButton,
};

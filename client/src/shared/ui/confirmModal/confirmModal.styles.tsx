import { styled, keyframes } from "styled-components";
import { media } from "../../../styles/breakpoints";
import { colors } from "@/styles/colors";

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${colors.scrim};
  display: flex;
  justify-content: center;
  align-items: center;
  /* 드로어(9999) 위. Modal/BottomSheet와 같은 최상위 오버레이 값 */
  z-index: 10000;
  animation: ${fadeIn} 0.2s ease-out;
`;

const Container = styled.div`
  background-color: ${colors.surface.overlay};
  border-radius: 12px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: ${scaleIn} 0.2s ease-out;

  ${media.mobile} {
    min-width: unset;
    width: calc(100% - 32px);
    margin: 16px;
  }
`;

const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const Message = styled.p`
  margin: 0 0 24px 0;
  font-size: 14px;
  color: ${colors.text.secondary};
  line-height: 1.5;
  white-space: pre-line;
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

/** 진행 상황 안내. Message와 버튼 사이에 놓이며, 화면 낭독기에는 role="status"로 읽힌다. */
const StatusArea = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: -8px 0 20px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: ${colors.background.secondary};
  font-size: 14px;
  line-height: 1.5;
  color: ${colors.text.primary};
  white-space: pre-line;
`;

const Spinner = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const Button = styled.button<{ $variant?: "danger" | "cancel" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  ${({ $variant }) =>
    $variant === "danger"
      ? `
    background-color: ${colors.danger.text};
    color: ${colors.background.primary};
    border: none;

    &:hover:not(:disabled) {
      background-color: color-mix(in srgb, ${colors.text.primary} 12%, ${colors.danger.text});
    }
  `
      : `
    background-color: ${colors.surface.overlay};
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover:not(:disabled) {
      background-color: ${colors.background.secondary};
    }
  `}

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${media.mobile} {
    flex: 1;
    padding: 12px;
  }
`;

export { Overlay, Container, Title, Message, StatusArea, Spinner, ButtonGroup, Button };

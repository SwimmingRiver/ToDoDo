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
  z-index: 1000;
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
    background-color: ${colors.danger.main};
    color: ${colors.background.primary};
    border: none;

    &:hover {
      background-color: color-mix(in srgb, ${colors.danger.main} 80%, black);
    }
  `
      : `
    background-color: ${colors.surface.overlay};
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover {
      background-color: ${colors.background.secondary};
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${media.mobile} {
    flex: 1;
    padding: 12px;
  }
`;

export { Overlay, Container, Title, Message, ButtonGroup, Button };

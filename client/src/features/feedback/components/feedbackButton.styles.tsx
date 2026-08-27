import { styled, keyframes } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
`;

export const TriggerButton = styled.button`
  font-size: 13px;
  background: none;
  border: none;
  color: ${colors.text.secondary};
  cursor: pointer;
  padding: 0;

  &:hover {
    color: ${colors.brand.strong};
  }
`;

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: ${fadeIn} 0.2s ease-out;
`;

export const Container = styled.div`
  background-color: ${colors.background.primary};
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: calc(100% - 32px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: ${scaleIn} 0.2s ease-out;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${media.mobile} {
    width: calc(100% - 32px);
  }
`;

export const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const Textarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${colors.brand.strong};
  }

  &:disabled {
    background-color: ${colors.background.secondary};
    cursor: not-allowed;
  }
`;

export const CharCount = styled.span`
  align-self: flex-end;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const ErrorMessage = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.danger.text};
`;

export const SuccessMessage = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.brand.strong};
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

export const Button = styled.button<{ $variant?: "primary" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: ${colors.brand.strong};
    color: white;
    border: none;

    &:hover {
      background-color: ${colors.brand.strongHover};
    }
  `
      : `
    background-color: white;
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
`;

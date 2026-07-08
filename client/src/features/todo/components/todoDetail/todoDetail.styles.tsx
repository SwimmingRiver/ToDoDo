import { keyframes, styled } from "styled-components";
import { media } from "../../../../styles/breakpoints";
import { colors } from "@/styles/colors";
import { statusColors, type Status } from "@/styles/statusColors";

const slideIn = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: ${fadeIn} 0.3s ease-out;
`;

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 50%;
  height: 100vh;
  background-color: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 101;
  animation: ${slideIn} 0.3s ease-out;
  display: flex;
  flex-direction: column;

  ${media.tablet} {
    width: 70%;
  }

  ${media.mobile} {
    width: 100%;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 16px;
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const CloseButton = styled.button`
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

  &:hover {
    background-color: #e0ede8;
    color: ${colors.brand.secondary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }
`;

const PanelContent = styled.div`
  flex: 1;
  padding: 24px;
  overflow-y: auto;

  ${media.mobile} {
    padding: 16px;
  }
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${colors.text.tertiary};
  }

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${colors.text.tertiary};
  }

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 36px 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

const InfoRow = styled.div`
  display: flex;
  gap: 16px;

  ${media.mobile} {
    flex-direction: column;
    gap: 12px;
  }
`;

const InfoItem = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${colors.text.primary};
`;

const PanelFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 12px 16px;
  }
`;

const PanelFooterActions = styled.div`
  display: flex;
  gap: 12px;
  margin-left: auto;

  ${media.mobile} {
    flex-direction: column-reverse;
    width: 100%;
  }
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" | "danger" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: ${colors.brand.secondary};
    color: white;
    border: none;
    box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);

    &:hover {
      background-color: ${colors.brand.primary};
      box-shadow: 0 2px 6px rgba(15, 110, 86, 0.25);
    }

    &:active {
      background-color: ${colors.brand.primary};
      box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);
    }
  `
      : $variant === "danger"
        ? `
    background-color: white;
    color: ${colors.danger.text};
    border: 1px solid ${colors.border.danger};
    display: inline-flex;
    align-items: center;
    gap: 6px;

    &:hover {
      background-color: ${colors.danger.background};
    }

    &:active {
      background-color: ${colors.danger.subtle};
    }
  `
        : `
    background-color: white;
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover {
      background-color: ${colors.background.secondary};
      border-color: ${colors.text.tertiary};
    }
  `}

  ${media.mobile} {
    width: 100%;
    padding: 12px;
  }
`;

const StatusBadge = styled.span<{ $status: Status }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $status }) => statusColors[$status].light};
  color: ${({ $status }) => statusColors[$status].main};
`;

const priorityStyles = {
  high: {
    border: colors.danger.main,
    background: colors.danger.background,
    text: colors.danger.text,
  },
  medium: {
    border: "#F59E0B",
    background: "#FEF3E2",
    text: "#B45309",
  },
  low: {
    border: colors.border.tertiary,
    background: colors.background.secondary,
    text: colors.text.secondary,
  },
} as const;

const PriorityBadge = styled.span<{ $priority: keyof typeof priorityStyles }>`
  display: inline-block;
  padding: 4px 10px 4px 8px;
  border-left: 3px solid ${({ $priority }) => priorityStyles[$priority].border};
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $priority }) => priorityStyles[$priority].background};
  color: ${({ $priority }) => priorityStyles[$priority].text};
`;

const ErrorText = styled.span`
  color: ${colors.danger.text};
  font-size: 12px;
`;

export {
  Overlay,
  Panel,
  PanelHeader,
  PanelTitle,
  CloseButton,
  PanelContent,
  FormContainer,
  FormGroup,
  Label,
  Input,
  TextArea,
  Select,
  InfoRow,
  InfoItem,
  InfoLabel,
  InfoValue,
  PanelFooter,
  PanelFooterActions,
  Button,
  StatusBadge,
  PriorityBadge,
  ErrorText,
};

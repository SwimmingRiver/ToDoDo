import { keyframes, styled } from "styled-components";
import { media } from "../../../../styles/breakpoints";

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
  border-bottom: 1px solid #e0e0e0;

  ${media.mobile} {
    padding: 16px;
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;

  &:hover {
    background-color: #f0f0f0;
    color: #333;
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
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1c72eb;
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
  color: #888;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: #333;
`;

const PanelFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;

  ${media.mobile} {
    padding: 12px 16px;
    flex-direction: column-reverse;
  }
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: #1c72eb;
    color: white;
    border: none;

    &:hover {
      background-color: #1560c7;
    }
  `
      : `
    background-color: white;
    color: #666;
    border: 1px solid #ddd;

    &:hover {
      background-color: #f5f5f5;
    }
  `}

  ${media.mobile} {
    width: 100%;
    padding: 12px;
  }
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  ${({ $status }) => {
    switch ($status) {
      case "todo":
        return `background-color: #e3f2fd; color: #1976d2;`;
      case "doing":
        return `background-color: #fff3e0; color: #f57c00;`;
      case "done":
        return `background-color: #e8f5e9; color: #388e3c;`;
      default:
        return `background-color: #f5f5f5; color: #666;`;
    }
  }}
`;

const PriorityBadge = styled.span<{ $priority: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  ${({ $priority }) => {
    switch ($priority) {
      case "high":
        return `background-color: #ffebee; color: #d32f2f;`;
      case "medium":
        return `background-color: #fff3e0; color: #f57c00;`;
      case "low":
        return `background-color: #e8f5e9; color: #388e3c;`;
      default:
        return `background-color: #f5f5f5; color: #666;`;
    }
  }}
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
  Button,
  StatusBadge,
  PriorityBadge,
};

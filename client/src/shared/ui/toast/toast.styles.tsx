import { styled, keyframes } from "styled-components";
import { media } from "@/styles/breakpoints";

const slideIn = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
`;

const progressShrink = keyframes`
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
`;

const ToastContainer = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${media.mobile} {
    top: auto;
    bottom: 20px;
    left: 12px;
    right: auto;
    width: calc(100% - 24px);
  }
`;

const ToastItem = styled.div<{ $type: "success" | "error" | "warning" | "info"; $isExiting: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 320px;
  max-width: 400px;
  padding: 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: ${({ $isExiting }) => ($isExiting ? slideOut : slideIn)} 0.3s ease forwards;
  position: relative;
  overflow: hidden;

  ${media.mobile} {
    min-width: auto;
    max-width: none;
    width: 100%;
  }
`;

const IconWrapper = styled.div<{ $type: "success" | "error" | "warning" | "info" }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: ${({ $type }) => {
    switch ($type) {
      case "success":
        return "#e8f5e9";
      case "error":
        return "#ffebee";
      case "warning":
        return "#fff3e0";
      case "info":
        return "#e3f2fd";
    }
  }};
  color: ${({ $type }) => {
    switch ($type) {
      case "success":
        return "#4caf50";
      case "error":
        return "#f44336";
      case "warning":
        return "#ff9800";
      case "info":
        return "#2196f3";
    }
  }};
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.4;
`;

const Message = styled.p`
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #666;
  line-height: 1.4;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background-color: #f5f5f5;
    color: #666;
  }
`;

const ProgressBar = styled.div<{ $type: "success" | "error" | "warning" | "info"; $duration: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: ${({ $type }) => {
    switch ($type) {
      case "success":
        return "#4caf50";
      case "error":
        return "#f44336";
      case "warning":
        return "#ff9800";
      case "info":
        return "#2196f3";
    }
  }};
  animation: ${progressShrink} ${({ $duration }) => $duration}ms linear forwards;
`;

export {
  ToastContainer,
  ToastItem,
  IconWrapper,
  Content,
  Title,
  Message,
  CloseButton,
  ProgressBar,
};

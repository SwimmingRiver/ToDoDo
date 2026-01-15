import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import {
  ToastContainer,
  ToastItem,
  IconWrapper,
  Content,
  Title,
  Message,
  CloseButton,
  ProgressBar,
} from "./toast.styles";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  isExiting?: boolean;
}

interface ToastProps {
  toasts: ToastData[];
  onClose: (id: string) => void;
}

const getIcon = (type: ToastType) => {
  switch (type) {
    case "success":
      return CheckCircle;
    case "error":
      return XCircle;
    case "warning":
      return AlertTriangle;
    case "info":
      return Info;
  }
};

const Toast = ({ toasts, onClose }: ToastProps) => {
  if (toasts.length === 0) return null;

  return (
    <ToastContainer>
      {toasts.map((toast) => {
        const Icon = getIcon(toast.type);
        const duration = toast.duration ?? 3000;

        return (
          <ToastItem key={toast.id} $type={toast.type} $isExiting={toast.isExiting ?? false}>
            <IconWrapper $type={toast.type}>
              <Icon size={14} />
            </IconWrapper>
            <Content>
              <Title>{toast.title}</Title>
              {toast.message && <Message>{toast.message}</Message>}
            </Content>
            <CloseButton onClick={() => onClose(toast.id)}>
              <X size={16} />
            </CloseButton>
            {!toast.isExiting && <ProgressBar $type={toast.type} $duration={duration} />}
          </ToastItem>
        );
      })}
    </ToastContainer>
  );
};

export default Toast;

import { Loader2 } from "lucide-react";
import {
  Overlay,
  Container,
  Title,
  Message,
  StatusArea,
  Spinner,
  ButtonGroup,
  Button,
} from "./confirmModal.styles";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** true면 "확인" 버튼을 disabled 처리 (mutation isPending 연동 등 중복 클릭 방지용) */
  confirmDisabled?: boolean;
  /**
   * 되돌릴 수 없는 작업이 진행 중일 때 true. 확인 버튼에 스피너를 붙이고, 확인·취소 버튼과
   * 오버레이 닫기를 모두 막는다. 중간에 닫혀 "일부만 처리된" 상태가 되는 것을 줄이기 위해서다.
   */
  pending?: boolean;
  /** 진행 상황 등 버튼 위에 보여줄 안내. 화면 낭독기에는 role="status"로 읽힌다. */
  statusMessage?: string;
}

const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = "삭제",
  cancelText = "취소",
  onConfirm,
  onCancel,
  confirmDisabled = false,
  pending = false,
  statusMessage,
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!pending) onCancel();
  };

  return (
    <Overlay onClick={handleOverlayClick}>
      <Container onClick={(e) => e.stopPropagation()} aria-busy={pending || undefined}>
        <Title>{title}</Title>
        <Message>{message}</Message>
        {statusMessage && (
          <StatusArea role="status">
            {pending && (
              <Spinner aria-hidden="true">
                <Loader2 size={18} />
              </Spinner>
            )}
            <span>{statusMessage}</span>
          </StatusArea>
        )}
        <ButtonGroup>
          <Button onClick={onCancel} disabled={pending}>
            {cancelText}
          </Button>
          <Button $variant="danger" onClick={onConfirm} disabled={confirmDisabled || pending}>
            {pending && (
              <Spinner aria-hidden="true">
                <Loader2 size={16} />
              </Spinner>
            )}
            {confirmText}
          </Button>
        </ButtonGroup>
      </Container>
    </Overlay>
  );
};

export default ConfirmModal;

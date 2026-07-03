import {
  Overlay,
  Container,
  Title,
  Message,
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
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <Overlay onClick={onCancel}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Title>{title}</Title>
        <Message>{message}</Message>
        <ButtonGroup>
          <Button onClick={onCancel}>{cancelText}</Button>
          <Button $variant="danger" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmText}
          </Button>
        </ButtonGroup>
      </Container>
    </Overlay>
  );
};

export default ConfirmModal;

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
}

const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = "삭제",
  cancelText = "취소",
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <Overlay onClick={onCancel}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Title>{title}</Title>
        <Message>{message}</Message>
        <ButtonGroup>
          <Button onClick={onCancel}>{cancelText}</Button>
          <Button $variant="danger" onClick={onConfirm}>
            {confirmText}
          </Button>
        </ButtonGroup>
      </Container>
    </Overlay>
  );
};

export default ConfirmModal;

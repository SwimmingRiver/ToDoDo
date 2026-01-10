import {
  ModalBackground,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  ModalSubmitButton,
} from "./modal.styles";

const Modal = ({
  children,
  isOpen,
  setIsOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  if (!isOpen) return null;
  const handleClose = () => {
    setIsOpen(false);
  };
  return (
    <>
      <ModalBackground onClick={handleClose}>
        <ModalContainer onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalCloseButton onClick={handleClose}>X</ModalCloseButton>
          </ModalHeader>
          <ModalBody>{children}</ModalBody>
          <ModalFooter>
            <ModalSubmitButton type="submit" form="todo-form">Submit</ModalSubmitButton>
          </ModalFooter>
        </ModalContainer>
      </ModalBackground>
    </>
  );
};

export default Modal;

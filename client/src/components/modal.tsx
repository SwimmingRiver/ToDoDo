import { styled } from "styled-components";
const ModalBackground = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
`;
const ModalContainer = styled.div`
  width: auto;

  min-width: 400px;
  height: auto;
  max-height: 80vh;
  padding: 16px;
  background-color: white;
  z-index: 1000;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  flex: 0 0 50px;
  background-color: white;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 10px;
`;

const ModalBody = styled.div`
  width: 100%;
  flex: 1 1 auto;
  background-color: white;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  overflow-y: auto;
  box-sizing: border-box;
`;
const ModalFooter = styled.div`
  width: 100%;
  flex: 0 0 50px;
  background-color: #f0f0f0;
`;
const ModalCloseButton = styled.button`
  width: 20px;
  height: 20px;
  background-color: #f0f0f0;
  border: none;
  cursor: pointer;
`;
const ModalSubmitButton = styled.button`
  width: 100%;
  height: 100%;
  background-color: #1c72eb;
  color: white;
  font-size: 16px;
  font-weight: bold;
  border: none;
  cursor: pointer;
`;
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

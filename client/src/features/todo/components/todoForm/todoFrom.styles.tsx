import { styled } from "styled-components";
const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
`;

const InputLabel = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: #1c72eb;
  }
`;

const MoreButton = styled.button`
  height: 40px;
  border: none;
  cursor: pointer;
  background: none;
  color: #1c72eb;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const MoreButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DetailSection = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows 0.3s ease-in-out;
  overflow: hidden;
`;

const DetailContent = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;

  &:focus {
    border-color: #1c72eb;
  }
`;

export {
  FormContainer,
  InputLabel,
  Input,
  MoreButton,
  MoreButtonContainer,
  DetailSection,
  DetailContent,
  Select,
};

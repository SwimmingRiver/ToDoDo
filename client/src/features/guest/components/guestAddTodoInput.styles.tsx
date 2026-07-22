import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Form = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.sm};
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${colors.brand.secondary};
  }
`;

const AddButton = styled.button`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 16px;
  background-color: ${colors.brand.secondary};
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: ${radius.md};
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.primary};
  }

  &:disabled {
    background-color: ${colors.border.secondary};
    cursor: not-allowed;
  }
`;

export { Form, Input, AddButton };

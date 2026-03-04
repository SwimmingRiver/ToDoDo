import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";

const TodoListContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;

  ${media.mobile} {
    padding: 12px 8px;
  }
`;

const AddButton = styled.button`
  width: 100%;
  height: 40px;
  flex-shrink: 0;
  background-color: #1c72eb;
  color: white;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #1560c7;
  }

  ${media.mobile} {
    height: 36px;
    font-size: 14px;
  }
`;

const ListWrapper = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export { TodoListContainer, AddButton, ListWrapper };

import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";

const TodoListContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;

  ${media.mobile} {
    padding: 0 4px;
  }
`;

const AddButton = styled.button`
  width: 100%;
  height: 40px;
  background-color: #1c72eb;
  color: white;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;

  ${media.mobile} {
    height: 36px;
    font-size: 14px;
  }
`;
export { TodoListContainer, AddButton };

import { styled } from "styled-components";

const TodoListItemContainer = styled.div<{ isChild?: boolean }>`
  border: 1px solid #e0e0e0;
  padding: 10px;
  padding-left: ${(props) => (props.isChild ? "32px" : "10px")};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  &:hover {
    background-color: #f0f0f0;
  }
`;

const ExpandButton = styled.button<{ isExpanded: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  transition: all 0.2s ease;

  &:hover {
    background-color: #e9ecef;
    color: #333;
  }

  &::before {
    content: "${(props) => (props.isExpanded ? "▼" : "▶")}";
    margin-right: 4px;
  }
`;

const AddChildButton = styled.button`
  width: calc(100% - 32px);
  padding: 8px 12px;
  margin-left: 32px;
  margin-top: 4px;
  background-color: #f8f9fa;
  border: 1px dashed #dee2e6;
  border-radius: 8px;
  color: #495057;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: #e9ecef;
    border-color: #adb5bd;
    color: #212529;
  }

  &::before {
    content: "+ ";
    font-weight: bold;
  }
`;

const StatusSelect = styled.select`
  padding: 6px 12px;
  background-color: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  color: #495057;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #adb5bd;
  }

  &:focus {
    outline: none;
    border-color: #1c72eb;
    box-shadow: 0 0 0 2px rgba(28, 114, 235, 0.1);
  }
`;

const TodoTitle = styled.span`
  cursor: pointer;
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: #e3f2fd;
  }
`;

export {
  TodoListItemContainer,
  ExpandButton,
  AddChildButton,
  StatusSelect,
  TodoTitle,
};

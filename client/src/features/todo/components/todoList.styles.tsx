import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";
import { colors } from "@/styles/colors";

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
  height: 48px;
  flex-shrink: 0;
  background-color: ${colors.brand.primary};
  color: white;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--border-radius-lg, 10px);
  cursor: pointer;
  margin: 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #0d5e49;
  }

  ${media.mobile} {
    height: 44px;
  }
`;

const ProjectListToolbar = styled.div`
  padding: 0 0 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

const ProjectCountText = styled.span`
  font-size: 12px;
  color: var(--color-text-tertiary, #9aa0a6);
  font-weight: 500;
`;

const NewProjectLink = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${colors.brand.secondary};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;

  &:hover {
    opacity: 0.8;
  }
`;

const ListWrapper = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
`;

export {
  TodoListContainer,
  AddButton,
  ListWrapper,
  ProjectListToolbar,
  ProjectCountText,
  NewProjectLink,
};

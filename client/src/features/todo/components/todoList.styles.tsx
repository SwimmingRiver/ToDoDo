import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";
import { colors } from "@/styles/colors";

const TodoListContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
  overflow: hidden;

  ${media.mobile} {
    padding: 12px 8px;
  }
`;

const AddButton = styled.button`
  width: 100%;
  height: 48px;
  flex-shrink: 0;
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
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
    background-color: ${colors.brand.strongHover};
  }

  ${media.mobile} {
    height: 44px;
  }
`;

const AddButtonRow = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;

  & > ${AddButton} {
    flex: 1;
  }
`;

const AiPlanButton = styled.button`
  height: 48px;
  padding: 0 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: ${colors.brand.tint};
  color: ${colors.brand.strong};
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--border-radius-lg, 10px);
  cursor: pointer;

  &:hover {
    background-color: color-mix(in srgb, ${colors.brand.strong} 12%, ${colors.brand.tint});
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
  color: ${colors.text.tertiary};
  font-weight: 500;
`;

const NewProjectLink = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${colors.brand.strong};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;

  &:hover {
    color: ${colors.brand.strongHover};
  }
`;

const ListWrapper = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
`;

export {
  TodoListContainer,
  AddButton,
  AddButtonRow,
  AiPlanButton,
  ListWrapper,
  ProjectListToolbar,
  ProjectCountText,
  NewProjectLink,
};

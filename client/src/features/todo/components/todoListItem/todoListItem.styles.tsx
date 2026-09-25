import { styled } from "styled-components";
import { media } from "../../../../styles/breakpoints";
import { statusColors, type Status } from "../../../../styles/statusColors";
import { colors } from "@/styles/colors";
import { urgencyColors } from "@/styles/urgencyColors";

const TodoListItemContainer = styled.div<{ isChild?: boolean; $status?: Status }>`
  border: 1px solid ${colors.border.tertiary};
  border-left: 4px solid
    ${({ $status }) => ($status ? statusColors[$status].main : colors.border.tertiary)};
  padding: 10px;
  padding-left: ${(props) => (props.isChild ? "28px" : "10px")};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  &:hover {
    background-color: ${colors.background.secondary};
  }

  ${media.mobile} {
    padding: 8px;
    padding-left: ${(props) => (props.isChild ? "16px" : "8px")};
    border-radius: 8px;
  }
`;

const ExpandButton = styled.button<{ isExpanded: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: ${colors.text.secondary};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 2px;

  &:hover {
    background-color: ${colors.border.tertiary};
    color: ${colors.text.primary};
  }
`;

const AddChildButton = styled.button`
  width: calc(100% - 32px);
  padding: 8px 12px;
  margin-left: 32px;
  margin-top: 4px;
  background-color: ${colors.background.secondary};
  border: 1px dashed ${colors.border.tertiary};
  border-radius: 8px;
  color: ${colors.text.primary};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    background-color: ${colors.border.tertiary};
    border-color: ${colors.border.secondary};
    color: ${colors.text.primary};
  }

  ${media.mobile} {
    width: calc(100% - 20px);
    margin-left: 20px;
    padding: 6px 10px;
    font-size: 12px;
  }
`;

const TodoTitle = styled.span`
  cursor: pointer;
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
`;
const TodoIconButton = styled.button<{ $variant?: "danger" }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  color: ${colors.text.secondary};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${({ $variant }) =>
      $variant === "danger" ? colors.danger.background : colors.background.secondary};
    color: ${({ $variant }) => ($variant === "danger" ? colors.danger.main : colors.text.primary)};
  }

  ${media.mobile} {
    padding: 4px;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`;

const DueBadge = styled.span<{ $daysLeft: number }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  flex-shrink: 0;
  background-color: ${({ $daysLeft }) =>
    $daysLeft < 0
      ? colors.danger.main
      : $daysLeft === 0
        ? urgencyColors.soon.main
        : urgencyColors.soon.text};
  color: ${colors.background.primary};
`;

export {
  TodoListItemContainer,
  ExpandButton,
  AddChildButton,
  TodoTitle,
  TodoIconButton,
  ButtonGroup,
  DueBadge,
};

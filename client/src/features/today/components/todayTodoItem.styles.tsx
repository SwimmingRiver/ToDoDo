import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 12px 0;
  border-bottom: 1px solid ${colors.border.tertiary};

  &:last-child {
    border-bottom: none;
  }
`;

const Checkbox = styled.button<{ $isDone: boolean; $isDanger: boolean }>`
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -13px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  &::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: ${radius.full};
    box-sizing: border-box;
    border: 1.5px solid
      ${({ $isDone, $isDanger }) =>
        $isDone
          ? "transparent"
          : $isDanger
            ? colors.border.danger
            : colors.border.secondary};
    background-color: ${({ $isDone }) =>
      $isDone ? colors.brand.secondary : "transparent"};
    transition: background-color 0.15s ease;
  }

  svg {
    position: relative;
    z-index: 1;
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
`;

const Title = styled.span<{ $isDone: boolean }>`
  min-width: 0;
  font-size: 14px;
  color: ${({ $isDone }) => ($isDone ? colors.text.tertiary : colors.text.primary)};
  text-decoration: ${({ $isDone }) => ($isDone ? "line-through" : "none")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Description = styled.span`
  font-size: 12px;
  color: ${colors.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TimeLabel = styled.span`
  flex-shrink: 0;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

const OverdueBadge = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background-color: ${colors.danger.background};
  color: ${colors.danger.text};
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -13px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: ${colors.text.tertiary};
  transition: color 0.2s ease;

  &:hover {
    color: ${colors.danger.main};
  }
`;

export {
  Row,
  Checkbox,
  Content,
  TitleRow,
  Title,
  Description,
  TimeLabel,
  OverdueBadge,
  DeleteButton,
};

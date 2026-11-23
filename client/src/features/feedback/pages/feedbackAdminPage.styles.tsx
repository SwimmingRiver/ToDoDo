import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const FeedbackAdminContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const FeedbackAdminBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`;

const FilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 6px 12px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? colors.brand.strong : colors.border.secondary)};
  color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.secondary)};
  background-color: ${colors.background.primary};
`;

const EmptyText = styled.p`
  margin: 24px 0;
  text-align: center;
  font-size: 14px;
  color: ${colors.text.tertiary};
`;

export { FeedbackAdminContainer, FeedbackAdminBody, FilterBar, FilterButton, EmptyText };

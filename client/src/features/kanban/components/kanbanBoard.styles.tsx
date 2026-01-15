import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";

const KanbanBoardContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  gap: 8px;
  padding: 8px;

  ${media.tablet} {
    flex-direction: column;
    overflow-y: auto;
  }
`;

const KanbanColumn = styled.div`
  width: 100%;
  height: 100%;
  background-color: #f4f5f7;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;

  ${media.tablet} {
    min-height: 200px;
    height: auto;
  }
`;

const ColumnTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: #5e6c84;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const KanbanItemList = styled.div<{ $isOver?: boolean }>`
  flex: 1;
  min-height: 100px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  background-color: ${({ $isOver }) => ($isOver ? "#e3e6ea" : "transparent")};
`;

const KanbanItemStyled = styled.div<{ $isDragging?: boolean }>`
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  cursor: grab;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.5 : 1)};

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

const ParentLabel = styled.span`
  font-size: 11px;
  color: #5e6c84;
  display: block;
  margin-bottom: 4px;
`;

const ItemTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  color: #172b4d;
  margin: 0;
`;

const DragOverlayItem = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  cursor: grabbing;
`;

const MobileTabContainer = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e0e0e0;
  background-color: #fff;
`;

const MobileTabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: ${({ $active }) => ($active ? "#1c72eb" : "#5f6368")};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? "#1c72eb" : "transparent")};
  transition: all 0.2s ease;

  &:hover {
    color: ${({ $active }) => ($active ? "#1c72eb" : "#1a1a1a")};
    background-color: #f8f9fa;
  }
`;

const MobileColumnWrapper = styled.div`
  flex: 1;
  overflow: auto;
  padding: 8px;
`;

export {
  KanbanBoardContainer,
  KanbanColumn,
  ColumnTitle,
  KanbanItemList,
  KanbanItemStyled,
  ParentLabel,
  ItemTitle,
  DragOverlayItem,
  MobileTabContainer,
  MobileTabButton,
  MobileColumnWrapper,
};

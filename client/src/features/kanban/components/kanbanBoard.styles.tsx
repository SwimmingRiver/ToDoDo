import { styled } from "styled-components";

const KanbanBoardContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  gap: 8px;
  padding: 8px;
`;

const KanbanColumn = styled.div`
  width: 100%;
  height: 100%;
  background-color: #f4f5f7;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
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

export {
  KanbanBoardContainer,
  KanbanColumn,
  ColumnTitle,
  KanbanItemList,
  KanbanItemStyled,
  ParentLabel,
  ItemTitle,
  DragOverlayItem,
};

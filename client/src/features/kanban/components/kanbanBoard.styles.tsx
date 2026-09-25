import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const KanbanBoardContainer = styled.div`
  width: 100%;
  height: 100%;
  flex: 1;
  display: flex;
  gap: 8px;
  padding: 8px;
  overflow: hidden;
`;

const KanbanColumn = styled.div`
  flex: 1;
  min-width: 0;
  height: 100%;
  background-color: ${colors.background.secondary};
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ColumnTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.secondary};
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const KanbanItemList = styled.div<{ $isOver?: boolean }>`
  flex: 1;
  min-height: 100px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  background-color: ${({ $isOver }) => ($isOver ? colors.border.tertiary : "transparent")};
  overflow-y: auto;
`;

const KanbanItemStyled = styled.div<{ $isDragging?: boolean }>`
  background: ${colors.surface.raised};
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
  color: ${colors.text.secondary};
  display: block;
  margin-bottom: 4px;
`;

const ItemTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  color: ${colors.text.primary};
  margin: 0;
`;

// 배지가 제목을 가리지 않도록 wrap 허용(recurringTodo.spec.md 1-3절, 8-5절 —
// ItemTitle에는 의도적으로 text-overflow: ellipsis를 적용하지 않는다).
const ItemTitleRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
`;

// 제목/배지 영역과 모바일 전용 "..." 액션시트 버튼을 한 줄에 배치한다.
// 버튼은 항상 우측 상단에 고정되도록 align-items: flex-start.
const ItemContentRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
`;

const DragOverlayItem = styled.div`
  background: ${colors.surface.raised};
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  cursor: grabbing;
`;

const MobileTabContainer = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${colors.border.tertiary};
  background-color: ${colors.background.primary};
`;

const MobileTabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.secondary)};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? colors.brand.strong : "transparent")};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.primary)};
    background-color: ${colors.background.secondary};
  }
`;

const MobileColumnWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  padding: 8px;
  display: flex;
  flex-direction: column;
`;

const EmptyColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  text-align: center;
  color: ${colors.text.tertiary};
`;

const EmptyIcon = styled.div`
  margin-bottom: 12px;
  opacity: 0.6;
`;

const EmptyText = styled.p`
  font-size: 13px;
  margin: 0;
  line-height: 1.4;
`;

export {
  KanbanBoardContainer,
  KanbanColumn,
  ColumnTitle,
  KanbanItemList,
  KanbanItemStyled,
  ParentLabel,
  ItemTitle,
  ItemTitleRow,
  ItemContentRow,
  DragOverlayItem,
  MobileTabContainer,
  MobileTabButton,
  MobileColumnWrapper,
  EmptyColumn,
  EmptyIcon,
  EmptyText,
};

import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const CalendarContainer = styled.div`
  width: 100%;
  height: 100%;
  padding: 16px;

  ${media.mobile} {
    padding: 8px;
  }

  /* 이벤트를 바(bar)로 표시 */
  .fc-daygrid-event {
    border: none !important;
    border-radius: 4px !important;
    padding: 2px 4px !important;
    margin: 1px 2px !important;
    font-size: 11px !important;
  }

  /* 드래그 drop 타겟 셀 강조 */
  .fc-highlight {
    background-color: #e8f5ef !important;
  }

  .fc-daygrid-event-dot {
    display: none;
  }

  .fc-daygrid-day-events {
    padding: 2px 0;
  }

  .fc-daygrid-more-link {
    font-size: 11px;
    color: #666;
  }

  /* 날짜 셀 클릭 가능하도록 */
  .fc-daygrid-day {
    cursor: pointer;

    &:hover {
      background-color: #f5f5f5;
    }
  }

  /* 날짜 셀 패딩 */
  .fc-daygrid-day-frame {
    padding: 4px;
  }

  .fc-daygrid-day-number {
    padding: 4px 8px;
    font-size: 13px;
  }

  ${media.mobile} {
    .fc-toolbar-title {
      font-size: 16px;
    }

    .fc-button {
      padding: 4px 8px;
      font-size: 12px;
    }

    /* 모바일: 이벤트를 얇은 컬러 바로 표시 (텍스트 숨김) */
    .fc-daygrid-event {
      height: 6px !important;
      min-height: 6px !important;
      padding: 0 !important;
      margin: 1px 2px !important;
      overflow: hidden !important;
    }

    .fc-daygrid-event .fc-event-main {
      display: none !important;
    }

    .fc-daygrid-more-link {
      display: none !important;
    }
  }
`;

const DayDetailList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DayDetailItem = styled.li<{ $color: string; $overdue?: boolean }>`
  padding: 12px 16px;
  border-left: 4px solid ${({ $color }) => $color};
  background-color: ${({ $overdue }) => ($overdue ? colors.danger.background : "#f9f9f9")};
  margin-bottom: 8px;
  border-radius: 0 8px 8px 0;
`;

const DayDetailTitle = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
`;

const DayDetailDate = styled.p`
  margin: 4px 0 0;
  font-size: 12px;
  color: #666;
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: #999;
  padding: 24px;
  font-size: 14px;
`;

const ViewToggleRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 4px;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid
    ${({ $active }) => ($active ? colors.brand.secondary : colors.border.secondary)};
  background-color: ${({ $active }) => ($active ? colors.brand.secondary : "transparent")};
  color: ${({ $active }) => ($active ? "#ffffff" : colors.text.secondary)};
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  min-height: 44px;

  &:first-child {
    border-radius: 6px 0 0 6px;
  }

  &:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }

  &:not([aria-pressed="true"]):hover {
    background-color: ${colors.background.secondary};
  }

  ${media.mobile} {
    font-size: 12px;
    padding: 6px 12px;
  }
`;

const AddButton = styled.button`
  width: calc(100% - 32px);
  margin: 12px 16px 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1.5px solid ${colors.brand.secondary};
  border-radius: 8px;
  background-color: transparent;
  color: ${colors.brand.secondary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #f0fbf7;
  }

  &:active {
    background-color: #d1f5e8;
  }
`;

export {
  CalendarContainer,
  DayDetailList,
  DayDetailItem,
  DayDetailTitle,
  DayDetailDate,
  EmptyMessage,
  ViewToggleRow,
  ViewButton,
  AddButton,
};

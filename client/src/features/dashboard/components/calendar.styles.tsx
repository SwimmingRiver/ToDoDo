import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";

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
    pointer-events: none;
  }

  .fc-daygrid-event-dot {
    display: none;
  }

  .fc-daygrid-block-event .fc-event-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  }
`;

const DayDetailList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DayDetailItem = styled.li<{ $color: string }>`
  padding: 12px 16px;
  border-left: 4px solid ${({ $color }) => $color};
  background-color: #f9f9f9;
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

export {
  CalendarContainer,
  DayDetailList,
  DayDetailItem,
  DayDetailTitle,
  DayDetailDate,
  EmptyMessage,
};

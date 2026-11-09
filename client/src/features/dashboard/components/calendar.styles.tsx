import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const CalendarContainer = styled.div`
  --fc-page-bg-color: ${colors.surface.raised};
  --fc-neutral-bg-color: ${colors.background.secondary};
  --fc-border-color: ${colors.border.tertiary};
  --fc-today-bg-color: ${colors.brand.tint};
  --fc-list-event-hover-bg-color: ${colors.background.secondary};
  --fc-neutral-text-color: ${colors.text.secondary};
  --fc-event-text-color: ${colors.brand.onStrong};
  --fc-button-text-color: ${colors.brand.onStrong};
  --fc-button-bg-color: ${colors.brand.strong};
  --fc-button-border-color: ${colors.brand.strong};
  --fc-button-hover-bg-color: ${colors.brand.strongHover};
  --fc-button-hover-border-color: ${colors.brand.strongHover};
  --fc-button-active-bg-color: ${colors.brand.strongHover};
  --fc-button-active-border-color: ${colors.brand.strongHover};

  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
    background-color: ${colors.brand.tint} !important;
  }

  .fc-daygrid-event-dot {
    display: none;
  }

  .fc-daygrid-day-events {
    padding: 2px 0;
  }

  .fc-daygrid-more-link {
    font-size: 11px;
    font-weight: 600;
    color: ${colors.text.secondary};
  }

  /* 날짜 셀 클릭 가능하도록 */
  .fc-daygrid-day {
    cursor: pointer;

    &:hover {
      background-color: ${colors.background.secondary};
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

    /* 모바일: 얇은 바만으로는 건수 구분이 안 되므로 "+N개"로 개수를 알린다 */
    .fc-daygrid-more-link {
      font-size: 10px;
      padding: 0 2px;
    }
  }
`;

const CalendarBody = styled.div`
  flex: 1;
  min-height: 0;
`;

const DayDetailList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DayDetailItem = styled.li<{ $color: string; $overdue?: boolean }>`
  border-left: 4px solid ${({ $color }) => $color};
  background-color: ${({ $overdue }) => ($overdue ? colors.danger.background : colors.surface.raised)};
  margin-bottom: 8px;
  border-radius: 0 8px 8px 0;
  overflow: hidden;
`;

/* li 전체를 덮는 버튼 — 모바일에서 격자의 6px 이벤트 바 대신 상세로 가는 탭 영역 */
const DayDetailButton = styled.button<{ $overdue?: boolean }>`
  position: relative; /* 안의 VisuallyHidden(absolute) 기준점 */
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;

  /* 지난 항목은 눌림 상태에서도 붉은 계열을 유지해야 일반 항목과 구분된다 */
  --day-detail-pressed-bg: ${({ $overdue }) =>
    $overdue ? colors.danger.subtle : colors.background.secondary};

  &:active {
    background-color: var(--day-detail-pressed-bg);
  }

  /* 터치 기기는 탭 후 :hover가 남아 마지막 항목이 계속 강조되므로 실제 호버 기기에만 */
  @media (hover: hover) {
    &:hover {
      background-color: var(--day-detail-pressed-bg);
    }
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

/* 누를 수 없는 행(구글 오버레이 이벤트) — 버튼 행과 같은 여백 */
const DayDetailStatic = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
`;

/* 아래 행 요소들은 <button> 안에 들어가므로 phrasing content(span)여야 유효한 HTML이다 —
   블록 배치는 display로 준다 */
const DayDetailBody = styled.span`
  display: block;
  flex: 1;
  min-width: 0;
`;

const DayDetailTitleRow = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const DayDetailTitle = styled.span`
  display: block;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: ${colors.text.primary};
`;

const DayDetailDate = styled.span`
  display: block;
  margin: 4px 0 0;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

const DayDetailRecurrenceCaption = styled.span`
  display: block;
  margin: 2px 0 0;
  font-size: 11px;
  color: ${colors.brand.strong};
`;

// eventContent 콜백에서 반복 아이콘 + 제목을 함께 배치하기 위한 래퍼
const EventContentWrapper = styled.span`
  display: flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: ${colors.text.tertiary};
  padding: 24px;
  font-size: 14px;
`;

const ViewToggleRow = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-bottom: 8px;
  padding: 0 4px;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid
    ${({ $active }) => ($active ? colors.brand.strong : colors.border.secondary)};
  background-color: ${({ $active }) => ($active ? colors.brand.strong : "transparent")};
  color: ${({ $active }) => ($active ? colors.brand.onStrong : colors.text.secondary)};
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
  border: 1.5px solid ${colors.brand.strong};
  border-radius: 8px;
  background-color: transparent;
  color: ${colors.brand.strong};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: ${colors.brand.tint};
  }

  &:active {
    background-color: color-mix(in srgb, ${colors.brand.strong} 12%, ${colors.brand.tint});
  }
`;

export {
  CalendarContainer,
  CalendarBody,
  DayDetailList,
  DayDetailItem,
  DayDetailButton,
  DayDetailBody,
  DayDetailStatic,
  DayDetailTitleRow,
  DayDetailTitle,
  DayDetailDate,
  DayDetailRecurrenceCaption,
  EventContentWrapper,
  EmptyMessage,
  ViewToggleRow,
  ViewButton,
  AddButton,
};

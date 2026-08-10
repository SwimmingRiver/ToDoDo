import { styled, keyframes } from "styled-components";

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

const cellFade = keyframes`
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.4;
  }
`;

// shimmer를 쓰는 회색 블록들의 공통 바탕. kanbanSkeleton과 같은 톤을 유지한다.
const Bar = styled.div`
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400px 100%;
  border-radius: 4px;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
  flex: 1;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const ToolbarTitle = styled(Bar)`
  height: 20px;
  width: 140px;
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: 6px;
`;

const ToolbarButton = styled(Bar)`
  height: 28px;
  width: 56px;
  border-radius: 6px;
`;

const WeekdayRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
`;

const Weekday = styled(Bar)`
  height: 12px;
  width: 60%;
  margin: 0 auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 4px;
  flex: 1;
  min-height: 0;
`;

const Cell = styled.div<{ $delay: number }>`
  background: #f7f8f9;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  animation: ${cellFade} 2s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
`;

const DayNumber = styled(Bar)`
  height: 10px;
  width: 16px;
`;

const EventBar = styled(Bar)<{ $width: string }>`
  height: 8px;
  width: ${({ $width }) => $width};
  opacity: 0.8;
`;

export {
  Container,
  Toolbar,
  ToolbarTitle,
  ToolbarButtons,
  ToolbarButton,
  WeekdayRow,
  Weekday,
  Grid,
  Cell,
  DayNumber,
  EventBar,
};

import { styled, keyframes } from "styled-components";

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

// calendarSkeleton과 같은 Bar 톤을 유지한다.
const Bar = styled.div`
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400px 100%;
  border-radius: 8px;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
`;

const StreakBar = styled(Bar)`
  height: 72px;
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
`;

const CardBar = styled(Bar)`
  height: 88px;
`;

const SecondaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
`;

const SecondaryBar = styled(Bar)`
  height: 160px;
`;

export { Container, StreakBar, CardsGrid, CardBar, SecondaryGrid, SecondaryBar };

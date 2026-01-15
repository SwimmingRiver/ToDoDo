import { styled, keyframes } from "styled-components";

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

const checkIn = keyframes`
  0% {
    stroke-dashoffset: 24;
  }
  50% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: 0;
  }
`;

const fadeCheck = keyframes`
  0%, 45% {
    opacity: 0;
  }
  50%, 100% {
    opacity: 1;
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`;

const SkeletonItem = styled.div<{ $delay: number }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8eaed;
`;

const CheckboxWrapper = styled.div<{ $delay: number }>`
  width: 20px;
  height: 20px;
  position: relative;
  flex-shrink: 0;
`;

const CheckboxBase = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid #dadce0;
  border-radius: 4px;
  background: #fff;
`;

const CheckMark = styled.svg<{ $delay: number }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  animation: ${fadeCheck} 2s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;

  .check-path {
    stroke: #1c72eb;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    animation: ${checkIn} 2s ease-in-out infinite;
    animation-delay: ${({ $delay }) => $delay}s;
  }
`;

const TextGroup = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SkeletonText = styled.div<{ $width: string; $delay: number }>`
  height: 14px;
  width: ${({ $width }) => $width};
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400px 100%;
  border-radius: 4px;
  animation: ${shimmer} 1.5s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay * 0.1}s;
`;

const SkeletonSubText = styled(SkeletonText)`
  height: 10px;
`;

export {
  Container,
  SkeletonItem,
  CheckboxWrapper,
  CheckboxBase,
  CheckMark,
  TextGroup,
  SkeletonText,
  SkeletonSubText,
};

import { styled, keyframes } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 16px;
`;

const SkeletonItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid ${colors.border.tertiary};

  &:last-child {
    border-bottom: none;
  }
`;

const CheckboxCircle = styled.div<{ $delay: number }>`
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: ${radius.full};
  background-color: ${colors.background.secondary};
  animation: ${pulse} 1.5s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
`;

const TextGroup = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SkeletonText = styled.div<{ $width: string; $delay: number }>`
  height: 14px;
  width: ${({ $width }) => $width};
  background: linear-gradient(
    90deg,
    ${colors.background.secondary} 25%,
    ${colors.border.tertiary} 50%,
    ${colors.background.secondary} 75%
  );
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
  CheckboxCircle,
  TextGroup,
  SkeletonText,
  SkeletonSubText,
};

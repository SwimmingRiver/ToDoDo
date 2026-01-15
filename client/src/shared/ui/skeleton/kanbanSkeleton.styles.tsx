import { styled, keyframes } from "styled-components";

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

const cardSlide = keyframes`
  0% {
    opacity: 0;
    transform: translateY(-10px);
  }
  20% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const checkPulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.6;
  }
`;

const Container = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;
  height: 100%;
  flex: 1;
`;

const Column = styled.div`
  flex: 1;
  background-color: #f4f5f7;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ColumnHeader = styled.div`
  height: 16px;
  width: 60px;
  background: linear-gradient(90deg, #e0e0e0 25%, #d0d0d0 50%, #e0e0e0 75%);
  background-size: 400px 100%;
  border-radius: 4px;
  margin-bottom: 4px;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const Card = styled.div<{ $delay: number }>`
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  animation: ${cardSlide} 2s ease-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
`;

const CardCheckbox = styled.div<{ $delay: number }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #1c72eb;
  opacity: 0.3;
  flex-shrink: 0;
  margin-top: 2px;
  animation: ${checkPulse} 2s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
`;

const CardContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const CardTitle = styled.div<{ $width: string }>`
  height: 14px;
  width: ${({ $width }) => $width};
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400px 100%;
  border-radius: 4px;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const CardSubtitle = styled(CardTitle)`
  height: 10px;
  opacity: 0.6;
`;

const MobileContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  flex: 1;
`;

export {
  Container,
  Column,
  ColumnHeader,
  Card,
  CardCheckbox,
  CardContent,
  CardTitle,
  CardSubtitle,
  MobileContainer,
};

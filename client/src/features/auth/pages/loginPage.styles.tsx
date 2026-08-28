import styled from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";
import { media } from "@/styles/breakpoints";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: ${colors.brand.tint};
`;

export const Card = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 48px 40px;
  background-color: ${colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

  /* 브랜드 악센트 바: 카드 상단 모서리와 맞물리는 순수 장식(텍스트 없음) */
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background-color: ${colors.brand.fill};
    border-radius: 12px 12px 0 0;
  }

  ${media.mobile} {
    padding: 40px 24px;
    gap: 24px;
  }
`;

export const Title = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

/* Google 로그인 버튼: 색상은 Google 브랜딩 가이드라인 고정값이라 토큰화하지 않는다. */
export const GoogleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background-color: #fff;
  border: 1px solid #dadce0;
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 500;
  color: #3c4043;
  cursor: pointer;
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    background-color: #f8f9fa;
  }

  &:active:not(:disabled) {
    background-color: #f1f3f4;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const ErrorMessage = styled.p`
  font-size: 14px;
  color: ${colors.danger.text};
  text-align: center;
  margin: 0;
  padding: 8px 12px;
  background-color: ${colors.danger.background};
  border-radius: ${radius.sm};
  width: 100%;
`;

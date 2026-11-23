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

/* Google 로그인 버튼: 로고 SVG 색만 Google 브랜딩 가이드라인 고정값이라 토큰화하지 않는다
   (GoogleIcon, loginPage.tsx 참고). 버튼 자체 색은 다른 요소와 동일하게 토큰화한다. */
export const Buttons = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
`;

export const GoogleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 24px;
  background-color: ${colors.surface.raised};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 500;
  color: ${colors.text.primary};
  cursor: pointer;
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    background-color: ${colors.background.secondary};
  }

  &:active:not(:disabled) {
    background-color: color-mix(in srgb, ${colors.text.primary} 6%, ${colors.background.secondary});
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

// eslint-disable-next-line no-restricted-syntax -- Apple 브랜드 고정색
const APPLE_BLACK = "#000000";
// eslint-disable-next-line no-restricted-syntax -- Apple 브랜드 고정색
const APPLE_BLACK_HOVER = "#1a1a1a";
// eslint-disable-next-line no-restricted-syntax -- Apple 브랜드 고정색
const APPLE_WHITE = "#ffffff";

/* Apple 버튼: Apple 가이드라인상 검정 바탕+흰 글자 고정. 크기는 GoogleButton과 동일(border 포함). */
export const AppleButton = styled(GoogleButton)`
  background-color: ${APPLE_BLACK};
  border-color: ${APPLE_BLACK};
  color: ${APPLE_WHITE};

  &:hover:not(:disabled),
  &:active:not(:disabled) {
    background-color: ${APPLE_BLACK_HOVER};
  }
`;

export const Hint = styled.p`
  font-size: 13px;
  color: ${colors.text.secondary};
  text-align: center;
  margin: -16px 0 0;
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

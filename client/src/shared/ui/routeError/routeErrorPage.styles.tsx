import styled, { css } from "styled-components";
import { colors } from "@/styles/colors";

export type RouteErrorVariant = "fullPage" | "inline";

export const Container = styled.div<{ $variant: RouteErrorVariant }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  background-color: ${colors.background.primary};

  ${({ $variant }) =>
    $variant === "fullPage"
      ? css`
          min-height: 100vh;
        `
      : css`
          height: 100%;
          min-height: 320px;
        `}
`;

export const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const Description = styled.p`
  margin: 0 0 24px 0;
  max-width: 320px;
  font-size: 14px;
  line-height: 1.5;
  color: ${colors.text.secondary};
  word-break: keep-all;
`;

export const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
`;

const buttonBase = css`
  min-height: 44px;
  padding: 0 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const PrimaryButton = styled.button`
  ${buttonBase}
  border: none;
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};

  &:hover {
    background-color: ${colors.brand.strongHover};
  }
`;

export const SecondaryButton = styled.button`
  ${buttonBase}
  border: 1px solid ${colors.border.secondary};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};

  &:hover {
    background-color: ${colors.background.secondary};
  }
`;

import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;

  ${media.tablet} {
    flex-direction: column;
    width: 100%;
  }
`;

const PrimaryButton = styled.button`
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
  background-color: ${colors.brand.strong};
  border: none;
  border-radius: ${radius.md};
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${colors.brand.strongHover};
  }

  ${media.tablet} {
    width: 100%;
  }
`;

const SecondaryButton = styled.button`
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 600;
  color: ${colors.brand.strong};
  background-color: transparent;
  border: 1px solid ${colors.brand.strong};
  border-radius: ${radius.md};
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${colors.brand.tint};
  }

  ${media.tablet} {
    width: 100%;
  }
`;

export { ButtonGroup, PrimaryButton, SecondaryButton };

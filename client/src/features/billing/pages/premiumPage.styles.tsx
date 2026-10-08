import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const PremiumContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const PremiumBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
`;

export const Heading = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.secondary};
`;

export const BenefitList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const Benefit = styled.li`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: ${colors.brand.strong};
`;

export const BenefitText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const BenefitTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const BenefitDescription = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const Price = styled.p`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const StatusText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${colors.text.primary};
`;

export const HintText = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const Warning = styled.div`
  padding: 12px;
  border-radius: ${radius.md};
  background-color: ${colors.danger.background};
  color: ${colors.danger.text};
  font-size: 14px;
  font-weight: 600;
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const BaseButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const PrimaryButton = styled(BaseButton)`
  border: none;
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};

  &:hover:not(:disabled) {
    background-color: ${colors.brand.strongHover};
  }
`;

export const SecondaryButton = styled(BaseButton)`
  border: 1px solid ${colors.border.secondary};
  background-color: transparent;
  color: ${colors.text.primary};
`;

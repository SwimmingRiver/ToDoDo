import { styled, css } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Section = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 64px 24px;
  border-top: 1px solid ${colors.border.tertiary};
  scroll-margin-top: 16px;

  ${media.tablet} {
    padding: 40px 20px;
  }
`;

const Heading = styled.h2`
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const Plans = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 360px));
  gap: 24px;
  width: 100%;
  justify-content: center;

  ${media.tablet} {
    grid-template-columns: minmax(0, 1fr);
    max-width: 420px;
  }
`;

const PlanCard = styled.article<{ $highlighted?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px 24px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};

  ${({ $highlighted }) =>
    $highlighted &&
    css`
      border: 2px solid ${colors.brand.strong};
    `}
`;

const PlanName = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const PlanPrice = styled.p`
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const PriceNote = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

const FeatureList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 15px;
  color: ${colors.text.primary};

  svg {
    flex-shrink: 0;
    margin-top: 3px;
    color: ${colors.brand.strong};
  }
`;

const FeatureText = styled.span`
  display: flex;
  flex-direction: column;
`;

const FeatureDescription = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

const PlanButton = styled.button<{ $variant: "primary" | "secondary" }>`
  min-height: 44px;
  padding: 0 20px;
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  ${({ $variant }) =>
    $variant === "primary"
      ? css`
          border: none;
          background-color: ${colors.brand.strong};
          color: ${colors.brand.onStrong};

          &:hover {
            background-color: ${colors.brand.strongHover};
          }
        `
      : css`
          border: 1px solid ${colors.brand.strong};
          background-color: transparent;
          color: ${colors.brand.strong};

          &:hover {
            background-color: ${colors.brand.tint};
          }
        `}
`;

const PlanHint = styled.p`
  margin: -8px 0 0;
  font-size: 13px;
  text-align: center;
  color: ${colors.text.secondary};
`;

const Notes = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  text-align: center;
  color: ${colors.text.secondary};

  p {
    margin: 0;
  }

  a {
    color: ${colors.brand.strong};
  }
`;

export {
  Section,
  Heading,
  Plans,
  PlanCard,
  PlanName,
  PriceRow,
  PlanPrice,
  PriceNote,
  FeatureList,
  FeatureItem,
  FeatureText,
  FeatureDescription,
  PlanButton,
  PlanHint,
  Notes,
};

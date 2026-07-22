import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const SecondaryCtaSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 64px 24px;
  text-align: center;
  border-top: 1px solid ${colors.border.tertiary};

  ${media.tablet} {
    padding: 40px 20px;
  }
`;

const SecondaryCtaText = styled.p`
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  color: ${colors.text.secondary};
`;

export { PageContainer, SecondaryCtaSection, SecondaryCtaText };

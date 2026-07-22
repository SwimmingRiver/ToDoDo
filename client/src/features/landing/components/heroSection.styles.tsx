import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const Section = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 32px;
  padding: 64px 24px;
  background-color: ${colors.background.secondary};

  ${media.tablet} {
    padding: 40px 20px;
  }
`;

const TextGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 36px;
  font-weight: 700;
  color: ${colors.text.primary};

  ${media.tablet} {
    font-size: 26px;
  }
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  color: ${colors.text.secondary};
`;

export { Section, TextGroup, Title, Subtitle };

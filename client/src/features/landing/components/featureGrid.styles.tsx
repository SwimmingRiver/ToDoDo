import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 64px 24px;

  ${media.tablet} {
    grid-template-columns: 1fr;
    padding: 40px 20px;
    gap: 16px;
  }
`;

export { Grid };

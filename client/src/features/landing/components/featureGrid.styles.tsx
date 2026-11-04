import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 64px 24px;

  ${media.tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 40px 20px;
    gap: 16px;
  }

  ${media.mobile} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export { Grid };

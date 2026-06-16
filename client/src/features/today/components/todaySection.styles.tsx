import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const Container = styled.section`
  padding: 12px 16px;
`;

const Title = styled.h2`
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 500;
  color: ${colors.text.tertiary};
`;

export { Container, Title };

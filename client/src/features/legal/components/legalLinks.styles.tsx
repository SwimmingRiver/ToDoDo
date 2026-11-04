import { Link } from "react-router-dom";
import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const LinksNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
`;

const LegalLink = styled(Link)`
  color: inherit;
  text-decoration: none;

  &:hover {
    color: ${colors.text.primary};
    text-decoration: underline;
  }
`;

export { LinksNav, LegalLink };

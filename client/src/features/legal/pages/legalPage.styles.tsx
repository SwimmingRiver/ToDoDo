import { Link } from "react-router-dom";
import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: ${colors.background.primary};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 12px 20px;
  }
`;

const HomeLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
  text-decoration: none;
`;

const LogoMark = styled.img`
  width: 28px;
  height: 28px;
  border-radius: ${radius.md};
`;

const Article = styled.article`
  flex: 1;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px 64px;
  color: ${colors.text.primary};
  line-height: 1.7;

  ${media.mobile} {
    padding: 32px 16px 48px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 28px;
  }

  h2 {
    margin: 32px 0 8px;
    font-size: 18px;
  }

  p,
  ul {
    margin: 8px 0;
    font-size: 15px;
  }

  ul {
    padding-left: 20px;
  }

  a {
    color: ${colors.brand.strong};
  }
`;

const EffectiveDate = styled.p`
  color: ${colors.text.secondary};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};

  table {
    width: 100%;
    min-width: 520px;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid ${colors.border.tertiary};
    text-align: left;
    vertical-align: top;
  }

  th {
    color: ${colors.text.secondary};
    font-weight: 600;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

export { PageContainer, Header, HomeLink, LogoMark, Article, EffectiveDate, TableWrapper };

import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const HeaderContainer = styled.header`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 12px 20px;
  }
`;

const Logo = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const LoginLink = styled.button`
  min-height: 44px;
  padding: 0 12px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.brand.secondary};
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: ${colors.brand.primary};
  }
`;

export { HeaderContainer, Logo, LoginLink };

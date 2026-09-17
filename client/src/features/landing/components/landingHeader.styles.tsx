import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

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

const LogoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LogoMark = styled.img`
  width: 28px;
  height: 28px;
  border-radius: ${radius.md};
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
  color: ${colors.brand.strong};
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: ${colors.brand.strongHover};
  }
`;

export { HeaderContainer, LogoGroup, LogoMark, Logo, LoginLink };

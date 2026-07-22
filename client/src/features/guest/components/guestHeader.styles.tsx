import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const HeaderContainer = styled.header`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 8px;
  }
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Logo = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

// recurrenceBadge와 동일한 pill 패턴(font-size 11px, padding 2px 8px)의 "체험 모드" 표시 배지.
const ModeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${radius.full};
  background-color: ${colors.brand.background};
  color: ${colors.brand.primary};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
`;

const LoginButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  background-color: ${colors.brand.secondary};
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: ${radius.md};
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${colors.brand.primary};
  }

  ${media.mobile} {
    padding: 0 12px;
    font-size: 13px;
  }
`;

export { HeaderContainer, TitleGroup, Logo, ModeBadge, LoginButton };

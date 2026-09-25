import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { colors } from "@/styles/colors";

const FooterContainer = styled.footer`
  width: 100%;
  border-top: 1px solid ${colors.border.tertiary};
  padding: 16px 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${colors.text.secondary};

  ${media.mobile} {
    padding: 12px 8px;
    font-size: 12px;
    gap: 6px;
  }
`;

const FooterLink = styled.a`
  color: ${colors.text.secondary};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

// 원래 리터럴(회색, ccc 계열)은 매핑표에 없어 가장 가까운 text 역할 토큰(text.tertiary)을 사용.
const Divider = styled.span`
  color: ${colors.text.tertiary};
`;

const Footer = () => {
  return (
    <FooterContainer>
      <span>© 2025 ToDoDo</span>
      <Divider>|</Divider>
      <FooterLink
        href="https://github.com/SwimmingRiver/tododo"
        target="_blank"
      >
        GitHub
      </FooterLink>
      <Divider>|</Divider>
      <FooterLink href="mailto:swimmingr@gmail.com">Contact</FooterLink>
    </FooterContainer>
  );
};

export default Footer;

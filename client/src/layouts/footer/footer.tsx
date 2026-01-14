import { styled } from "styled-components";

const FooterContainer = styled.footer`
  width: 100%;
  border-top: 1px solid #e0e0e0;
  padding: 16px 10px;
  margin-top: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
`;

const FooterLink = styled.a`
  color: #666;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Divider = styled.span`
  color: #ccc;
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

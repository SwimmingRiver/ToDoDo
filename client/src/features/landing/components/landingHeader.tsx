import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import {
  HeaderContainer,
  LogoGroup,
  LogoMark,
  Logo,
  HeaderNav,
  PricingLink,
  LoginLink,
} from "./landingHeader.styles";

const LandingHeader = () => {
  const navigate = useNavigate();

  return (
    <HeaderContainer>
      <LogoGroup>
        <LogoMark src={logo} alt="" />
        <Logo>ToDoDo</Logo>
      </LogoGroup>
      <HeaderNav aria-label="랜딩 메뉴">
        <PricingLink href="#pricing">요금제</PricingLink>
        <LoginLink type="button" onClick={() => navigate("/login")}>
          로그인 →
        </LoginLink>
      </HeaderNav>
    </HeaderContainer>
  );
};

export default LandingHeader;

import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import {
  HeaderContainer,
  LogoGroup,
  LogoMark,
  Logo,
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
      <LoginLink type="button" onClick={() => navigate("/login")}>
        로그인 →
      </LoginLink>
    </HeaderContainer>
  );
};

export default LandingHeader;

import { useNavigate } from "react-router-dom";
import { HeaderContainer, Logo, LoginLink } from "./landingHeader.styles";

const LandingHeader = () => {
  const navigate = useNavigate();

  return (
    <HeaderContainer>
      <Logo>ToDoDo</Logo>
      <LoginLink type="button" onClick={() => navigate("/login")}>
        로그인 →
      </LoginLink>
    </HeaderContainer>
  );
};

export default LandingHeader;

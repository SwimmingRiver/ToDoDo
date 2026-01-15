import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import logo from "../../assets/logo.png";

const HeaderContainer = styled.header`
  width: 100%;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;

  ${media.mobile} {
    padding: 8px;
  }
`;

const Logo = styled.img`
  height: 48px;

  ${media.mobile} {
    height: 36px;
  }
`;
const Header = () => {
  return (
    <HeaderContainer>
      <Logo src={logo} alt="logo" />
    </HeaderContainer>
  );
};

export default Header;

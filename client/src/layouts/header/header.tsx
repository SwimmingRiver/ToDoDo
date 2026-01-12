import { styled } from "styled-components";
import logo from "../../assets/logo.png";

const HeaderContainer = styled.header`
  width: 100%;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;
`;
const Header = () => {
  return (
    <HeaderContainer>
      <img src={logo} alt="logo" height={48} />
    </HeaderContainer>
  );
};

export default Header;

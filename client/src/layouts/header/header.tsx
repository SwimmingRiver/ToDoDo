import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { useNavigate } from "react-router-dom";

const HeaderContainer = styled.header`
  width: 100%;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;
  ${media.mobile} {
    padding: 8px;
  }
`;

const Header = () => {
  const navigate = useNavigate();
  return (
    <HeaderContainer>
      <HeaderTitle onClick={() => navigate("/")}>ToDoDo</HeaderTitle>
    </HeaderContainer>
  );
};

export default Header;

const HeaderTitle = styled.h1`
  cursor: pointer;
  &:hover {
    color: #1c72eb;
  }
`;

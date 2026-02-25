import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";

const HeaderContainer = styled.header`
  width: 100%;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;
  ${media.mobile} {
    padding: 8px;
  }
`;

const Header = () => {
  return (
    <HeaderContainer>
      <h1>ToDoDo</h1>
    </HeaderContainer>
  );
};

export default Header;

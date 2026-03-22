import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/useAuth";

const Header = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <HeaderContainer>
      <HeaderTitle onClick={() => navigate("/")}>ToDoDo</HeaderTitle>
      <UserInfo>
        <UserInfoText>{user?.displayName}</UserInfoText>
        <UserInfoImage src={user?.photoURL || ""} alt="user" />
        <LogoutButton onClick={logout}>로그아웃</LogoutButton>
      </UserInfo>
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
const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;
const UserInfoText = styled.span`
  font-size: 14px;
  font-weight: 500;
`;
const LogoutButton = styled.button`
  font-size: 14px;
  background: none;
  border: none;
  color: #1c72eb;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const UserInfoImage = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 50%;
`;
const HeaderContainer = styled.header`
  width: 100%;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;
  ${media.mobile} {
    padding: 8px;
  }
`;

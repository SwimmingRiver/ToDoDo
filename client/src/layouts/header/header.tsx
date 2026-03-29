import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/useAuth";
import { MenuIcon } from "lucide-react";

interface HeaderProps {
  onMenuOpen: () => void;
}

const Header = ({ onMenuOpen }: HeaderProps) => {
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
      <HamburgerMenuButton onClick={onMenuOpen}>
        <MenuIcon size={20} />
      </HamburgerMenuButton>
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

  ${media.tablet} {
    display: none;
  }
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
  align-items: center;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px;

  ${media.mobile} {
    padding: 8px;
  }
`;

const HamburgerMenuButton = styled.button`
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  color: #1a1a1a;
  padding: 4px;

  ${media.tablet} {
    display: flex;
    align-items: center;
  }
`;

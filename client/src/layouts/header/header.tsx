import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/useAuth";
import { MenuIcon } from "lucide-react";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";
import ProfileMenu from "@/layouts/profileMenu/profileMenu";
import ThemeMenu from "@/layouts/themeMenu/themeMenu";
import NotificationMenu from "@/layouts/notificationMenu/notificationMenu";
import UserAvatar from "@/layouts/userAvatar/userAvatar";
import { userLabel } from "@/layouts/userAvatar/userLabel";
import logo from "@/assets/logo.png";

interface HeaderProps {
  onMenuOpen: () => void;
  onDeleteAccountClick: () => void;
}

const Header = ({ onMenuOpen, onDeleteAccountClick }: HeaderProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <HeaderContainer>
      <LogoGroup onClick={() => navigate("/today")}>
        <LogoMark src={logo} alt="" />
        <HeaderTitle>ToDoDo</HeaderTitle>
      </LogoGroup>
      <RightGroup>
        <NotificationMenu />
        <ThemeMenu />
        <UserInfo>
          <ProfileMenu onDeleteAccountClick={onDeleteAccountClick}>
            <UserInfoText>{userLabel(user)}</UserInfoText>
            <UserAvatar user={user} size={24} />
          </ProfileMenu>
        </UserInfo>
        <HamburgerMenuButton onClick={onMenuOpen} aria-label="메뉴 열기">
          <MenuIcon size={20} />
        </HamburgerMenuButton>
      </RightGroup>
    </HeaderContainer>
  );
};

export default Header;

const LogoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  &:hover h1 {
    color: ${colors.brand.strong};
  }
`;

const LogoMark = styled.img`
  width: 32px;
  height: 32px;
  border-radius: ${radius.md};
`;

const HeaderTitle = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const RightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
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

const HeaderContainer = styled.header`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${colors.border.tertiary};
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
  color: ${colors.text.primary};
  padding: 4px;

  ${media.tablet} {
    display: flex;
    align-items: center;
  }
`;

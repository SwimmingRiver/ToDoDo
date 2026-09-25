import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/useAuth";
import ThemeMenu from "@/layouts/themeMenu/themeMenu";
import logo from "@/assets/logo.png";
import {
  HeaderContainer,
  LogoGroup,
  LogoMark,
  LogoText,
  RightGroup,
  AvatarButton,
  AvatarImage,
} from "./mobileHeader.styles";

interface MobileHeaderProps {
  onAvatarClick: () => void;
}

const MobileHeader = ({ onAvatarClick }: MobileHeaderProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <HeaderContainer>
      <LogoGroup onClick={() => navigate("/today")}>
        <LogoMark src={logo} alt="" aria-hidden="true" />
        <LogoText>ToDoDo</LogoText>
      </LogoGroup>
      <RightGroup>
        <ThemeMenu />
        <AvatarButton onClick={onAvatarClick} aria-label="사용자 메뉴 열기">
          <AvatarImage src={user?.photoURL || ""} alt="" />
        </AvatarButton>
      </RightGroup>
    </HeaderContainer>
  );
};

export default MobileHeader;

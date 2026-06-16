import { useAuth } from "@/features/auth/context/useAuth";
import {
  HeaderContainer,
  LogoGroup,
  LogoMark,
  LogoText,
  AvatarButton,
  AvatarImage,
} from "./mobileHeader.styles";

interface MobileHeaderProps {
  onAvatarClick: () => void;
}

const MobileHeader = ({ onAvatarClick }: MobileHeaderProps) => {
  const { user } = useAuth();

  return (
    <HeaderContainer>
      <LogoGroup>
        <LogoMark aria-hidden="true" />
        <LogoText>tododo</LogoText>
      </LogoGroup>
      <AvatarButton onClick={onAvatarClick} aria-label="사용자 메뉴 열기">
        <AvatarImage src={user?.photoURL || ""} alt="" />
      </AvatarButton>
    </HeaderContainer>
  );
};

export default MobileHeader;

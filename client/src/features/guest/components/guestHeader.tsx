import {
  HeaderContainer,
  TitleGroup,
  Logo,
  ModeBadge,
  LoginButton,
} from "./guestHeader.styles";

interface GuestHeaderProps {
  onLoginClick: () => void;
}

const GuestHeader = ({ onLoginClick }: GuestHeaderProps) => {
  return (
    <HeaderContainer>
      <TitleGroup>
        <Logo>ToDoDo</Logo>
        <ModeBadge>체험 모드</ModeBadge>
      </TitleGroup>
      <LoginButton type="button" onClick={onLoginClick}>
        Google로 로그인
      </LoginButton>
    </HeaderContainer>
  );
};

export default GuestHeader;

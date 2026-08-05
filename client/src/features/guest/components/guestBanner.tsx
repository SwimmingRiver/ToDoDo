import { Info } from "lucide-react";
import { BannerContainer, Message, LoginButton } from "./guestBanner.styles";

interface GuestBannerProps {
  onLoginClick: () => void;
}

/**
 * role="note": 배너가 페이지 로드 시 이미 고정 노출되어 있으므로 live region으로
 * 강제 알림을 주기보다 landmark 역할만으로 스크린리더에 "체험 모드" 사실이 전달되도록 한다.
 */
const GuestBanner = ({ onLoginClick }: GuestBannerProps) => {
  return (
    <BannerContainer role="note">
      <Message>
        <Info size={16} aria-hidden="true" />
        체험 모드입니다. 새로고침하거나 로그인해도 작성한 내용은 저장되지
        않아요.
      </Message>
      <LoginButton type="button" onClick={onLoginClick}>
        Google로 로그인하기
      </LoginButton>
    </BannerContainer>
  );
};

export default GuestBanner;

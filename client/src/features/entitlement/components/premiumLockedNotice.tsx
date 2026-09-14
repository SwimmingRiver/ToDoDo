import { Lock } from "lucide-react";
import { Wrapper, IconWrapper, Content, Title, Description, CtaButton } from "./premiumLockedNotice.styles";

interface PremiumLockedNoticeProps {
  title: string;
  description: string;
  /** 결제 연동 전까지는 호출부가 "프리미엄 관심 문의" 등으로 목적지를 정한다. */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** 툴바 버튼 자리처럼 좁은 공간에 넣을 때: description을 숨기고 한 줄로 압축한다. */
  compact?: boolean;
}

/**
 * 캘린더 연동/인사이트 등 여러 프리미엄 기능이 공유하는 잠금 안내 UI.
 * 기능마다 잠금 표시가 다르게 보이는 걸 피하기 위해 title/description/ctaLabel만
 * 다르게 받는다.
 */
const PremiumLockedNotice = ({
  title,
  description,
  ctaLabel,
  onCtaClick,
  compact,
}: PremiumLockedNoticeProps) => {
  return (
    <Wrapper $compact={compact}>
      <IconWrapper $compact={compact}>
        <Lock size={compact ? 14 : 16} aria-hidden="true" />
      </IconWrapper>
      <Content $compact={compact}>
        <Title $compact={compact}>{title}</Title>
        {!compact && <Description>{description}</Description>}
        {ctaLabel && onCtaClick && (
          <CtaButton $compact={compact} onClick={onCtaClick}>
            {ctaLabel}
          </CtaButton>
        )}
      </Content>
    </Wrapper>
  );
};

export default PremiumLockedNotice;
export type { PremiumLockedNoticeProps };

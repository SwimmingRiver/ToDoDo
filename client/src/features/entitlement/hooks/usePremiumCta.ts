import { useNavigate } from "react-router-dom";
import { BILLING_ENABLED } from "@/features/billing/config";
import { useUpgradeInterest } from "./useUpgradeInterest";

interface PremiumCta {
  ctaLabel: string;
  onCtaClick: () => void;
}

/** 결제 전: 피드백 채널에 관심을 남긴다(수요 파악용). */
export const useInterestCta = (featureLabel: string): PremiumCta => {
  const { submitInterest } = useUpgradeInterest(featureLabel);
  return { ctaLabel: "관심 있어요", onCtaClick: submitInterest };
};

/** 결제 후: 프리미엄 페이지로 보낸다. */
export const useNavigateToPremiumCta = (_featureLabel: string): PremiumCta => {
  const navigate = useNavigate();
  return { ctaLabel: "프리미엄 알아보기", onCtaClick: () => navigate("/premium") };
};

/**
 * 잠금 안내 3곳(AI 플랜·캘린더 연동·통계)이 공유하는 CTA. 빌드 시점 상수로 구현을 고르므로
 * 렌더마다 같은 훅이 호출되어 훅 규칙을 지킨다. 결제가 꺼진 빌드는 라우터 없이도 동작한다
 * (기존 컴포넌트 테스트가 MemoryRouter 없이 렌더한다).
 */
export const usePremiumCta: (featureLabel: string) => PremiumCta = BILLING_ENABLED
  ? useNavigateToPremiumCta
  : useInterestCta;

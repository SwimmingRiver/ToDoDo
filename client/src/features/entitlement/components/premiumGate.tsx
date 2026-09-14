import type { ReactNode } from "react";

interface PremiumGateProps {
  isPremium: boolean;
  isLoading?: boolean;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * 캘린더 연동/인사이트 등 어떤 프리미엄 기능인지 모르는 순수 분기 컴포넌트.
 * 로딩 중에는 아무것도 그리지 않는다 — ProtectedRoute가 인증 로딩 중 null을
 * 반환하는 기존 관례와 동일하게, "잠김 → 곧바로 해제"로 깜빡이는 걸 막는다.
 */
const PremiumGate = ({ isPremium, isLoading, fallback, children }: PremiumGateProps) => {
  if (isLoading) return null;
  return <>{isPremium ? children : fallback}</>;
};

export default PremiumGate;
export type { PremiumGateProps };

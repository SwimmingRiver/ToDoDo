import { useEntitlement } from "./useEntitlement";

/**
 * 소비 측(캘린더 연동, 인사이트 등)이 entitlements 문서 구조를 몰라도 되도록
 * boolean만 노출한다. 로딩 중에는 isPremium을 false로 두지 않고 isLoading으로
 * 구분해서, 로딩 끝나기 전에 "잠김"이 잘못 확정 노출되는 걸 막는다.
 */
const UNLOCKED_STATUSES = new Set(["active", "trialing"]);

export const useIsPremium = () => {
  const { data, isLoading } = useEntitlement();
  const isPremium = data?.plan === "premium" && !!data?.status && UNLOCKED_STATUSES.has(data.status);
  return { isPremium, isLoading };
};

import { useEffect, useState } from "react";
import { isPremiumEntitlement } from "../utils/isPremiumEntitlement";
import { useEntitlement } from "./useEntitlement";

/** setTimeout 지연 상한(약 24.8일). 그보다 먼 만료는 그때 가서 다시 렌더될 일이 생긴다. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 소비 측(캘린더 연동, 인사이트 등)이 entitlements 문서 구조를 몰라도 되도록 boolean만 노출한다.
 * 로딩 중에는 isLoading으로 구분해 "잠김"이 잘못 확정 노출되는 걸 막는다.
 * 만료 시각이 지나면 아무 이벤트 없이도 잠기도록 그 시점에 한 번 다시 렌더한다.
 */
export const useIsPremium = () => {
  const { data, isLoading } = useEntitlement();
  const [, setTick] = useState(0);
  const until = data?.premiumUntil ? Date.parse(data.premiumUntil) : null;

  useEffect(() => {
    if (until === null) return;
    const delay = until - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) return;
    const id = setTimeout(() => setTick((tick) => tick + 1), delay + 1);
    return () => clearTimeout(id);
  }, [until]);

  return { isPremium: isPremiumEntitlement(data, Date.now()), isLoading };
};

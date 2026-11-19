import { useEffect, useState } from "react";
import { isPremiumAt } from "@tododo/core/dist/entitlement/index.js";
import { useEntitlement } from "./useEntitlement";

/** setTimeout 지연 상한(약 24.8일). 그보다 먼 만료는 그때 가서 다시 렌더될 일이 생긴다. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** 만료 시각이 지나면 이벤트 없이도 잠기도록 그 시점에 한 번 다시 렌더한다. */
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

  return { isPremium: data ? isPremiumAt(data, new Date()) : false, isLoading };
};

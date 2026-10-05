import type { Entitlement } from "../types";

/** 서버와 같은 판단식: premiumUntil > 지금. 같은 순간은 프리미엄이 아니다. */
export const isPremiumEntitlement = (entitlement: Entitlement | undefined, nowMs: number): boolean =>
  !!entitlement?.premiumUntil && Date.parse(entitlement.premiumUntil) > nowMs;

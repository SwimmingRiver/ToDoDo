export { useEntitlement, useIsPremium, useUpgradeInterest, usePremiumCta, useEntitlementSync } from "./hooks";
export { default as PremiumGate } from "./components/premiumGate";
export { default as PremiumLockedNotice } from "./components/premiumLockedNotice";
export type { Entitlement, EntitlementPlan, EntitlementStatus } from "./types";
export { isPremiumEntitlement } from "./utils/isPremiumEntitlement";
export type { EntitlementSource } from "./types";

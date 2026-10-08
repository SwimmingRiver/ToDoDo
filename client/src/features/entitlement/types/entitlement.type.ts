type EntitlementPlan = "free" | "premium";

type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

/** manual = 운영자 스크립트, trial = 카드 없는 체험, paddle = 결제 웹훅. */
type EntitlementSource = "manual" | "trial" | "paddle" | null;

/**
 * entitlements/{uid}. 쓰기는 billing-proxy·운영자 스크립트만 한다(rules write:false).
 * 프리미엄 여부는 premiumUntil 하나로만 판단한다 — 서버(rules·Worker)의 premiumUntil 클레임과 같은 기준.
 */
interface Entitlement {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  source: EntitlementSource;
  /** ISO. 이 시각보다 이전이면 프리미엄. 클레임 premiumUntil(초)과 같은 순간. */
  premiumUntil: string | null;
  /** 체험을 쓴 시각. 값이 있으면 다시 체험할 수 없다. */
  trialUsedAt: string | null;
  /** 예약 해지가 실제로 끝나는 시각(표시용). */
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
  updatedAt: string;
}

/** entitlements/{uid} 문서가 없을 때 클라이언트가 취급하는 기본값. */
const DEFAULT_ENTITLEMENT: Entitlement = {
  plan: "free",
  status: "none",
  source: null,
  premiumUntil: null,
  trialUsedAt: null,
  cancelAt: null,
  currentPeriodEnd: null,
  customerId: null,
  subscriptionId: null,
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
  updatedAt: "",
};

export { DEFAULT_ENTITLEMENT };
export type { Entitlement, EntitlementPlan, EntitlementStatus, EntitlementSource };

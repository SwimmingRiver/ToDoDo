type EntitlementPlan = "free" | "premium";

type EntitlementStatus = "none" | "active" | "trialing" | "canceled" | "expired";

/** 결제사가 나중에 웹훅으로 채울 예약 필드. 지금은 항상 "manual"이거나 null이다. */
type EntitlementSource = "manual" | "paddle" | "lemonsqueezy" | "stripe" | null;

interface Entitlement {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  source: EntitlementSource;
  /** ISO. 결제 웹훅이 붙기 전까지는 사용하지 않는 예약 필드. */
  currentPeriodEnd: string | null;
  /** 결제사 고객 ID. 결제 웹훅이 붙기 전까지는 사용하지 않는 예약 필드. */
  customerId: string | null;
  /** 결제사 구독 ID. 결제 웹훅이 붙기 전까지는 사용하지 않는 예약 필드. */
  subscriptionId: string | null;
  /** 웹훅 이벤트 idempotency 키로 쓸 예약 필드. */
  lastWebhookEventId: string | null;
  updatedAt: string;
}

/** entitlements/{uid} 문서가 없을 때 클라이언트가 취급하는 기본값. */
const DEFAULT_ENTITLEMENT: Entitlement = {
  plan: "free",
  status: "none",
  source: null,
  currentPeriodEnd: null,
  customerId: null,
  subscriptionId: null,
  lastWebhookEventId: null,
  updatedAt: "",
};

export { DEFAULT_ENTITLEMENT };
export type { Entitlement, EntitlementPlan, EntitlementStatus, EntitlementSource };

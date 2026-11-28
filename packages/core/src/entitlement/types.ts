/**
 * entitlements/{uid} 문서 모델. 출처(paddle·apple·google·manual·trial)별 기록을 `sources`에 두고,
 * 최상위 필드는 그것을 합친 결과(aggregate)다. firebase를 import하지 않는다.
 */
export type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type SourceKey = "paddle" | "apple" | "google" | "manual" | "trial";
export type PaymentSourceKey = "paddle" | "apple" | "google";
export type EntitlementSource = SourceKey | null;
export type StoreEnvironment = "Production" | "Sandbox";

export interface SourceRecord {
  status: EntitlementStatus;
  premiumUntil: string | null;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  startedAt: string | null;
  updatedAt: string;
}

export interface PaddleRecord extends SourceRecord {
  customerId: string;
  subscriptionId: string;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
}

export interface AppleRecord extends SourceRecord {
  originalTransactionId: string;
  productId: string;
  environment: StoreEnvironment;
  appAccountToken: string | null;
  lastNotificationUUID: string | null;
  lastSignedDate: string | null;
}

export interface GoogleRecord extends SourceRecord {
  purchaseToken: string;
  productId: string;
  basePlanId: string | null;
  environment: StoreEnvironment;
  obfuscatedAccountId: string | null;
  lastMessageId: string | null;
  lastEventTime: string | null;
}

export interface Sources {
  paddle?: PaddleRecord;
  apple?: AppleRecord;
  google?: GoogleRecord;
  manual?: SourceRecord;
  trial?: SourceRecord;
}

export interface DuplicateInfo {
  laterSource: PaymentSourceKey;
  detectedAt: string;
}

/** 체험 재지급 방지 키를 만드는 로그인 제공자. worker-auth의 LoginProvider와 같은 값이어야 한다. */
export type TrialIdentityProvider = "google.com" | "apple.com";

export interface EntitlementDoc {
  plan: "free" | "premium";
  status: EntitlementStatus;
  source: EntitlementSource;
  premiumUntil: string | null;
  trialUsedAt: string | null;
  /**
   * 체험을 쓴 당시 로그인 계정의 HMAC 키 → 제공자. 서버(billing-proxy)만 쓴다.
   * 탈퇴할 때 그 순간 토큰의 계정과 합쳐 trialHistory에 남긴다 — 탈퇴 직전에 연결을 끊어도 빠지지 않게.
   * 배열이 아니라 맵인 이유: entitlementStore의 Firestore 변환이 배열을 지원하지 않고, 같은 키가 자연히 하나로 모인다.
   */
  trialIdentities: Record<string, TrialIdentityProvider>;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
  updatedAt: string;
  sources: Sources;
  duplicate: DuplicateInfo | null;
}

export const EMPTY_ENTITLEMENT: EntitlementDoc = {
  plan: "free",
  status: "none",
  source: null,
  premiumUntil: null,
  trialUsedAt: null,
  trialIdentities: {},
  cancelAt: null,
  currentPeriodEnd: null,
  customerId: null,
  subscriptionId: null,
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
  updatedAt: "",
  sources: {},
  duplicate: null,
};

const DAY_MS = 86_400_000;
/** 토큰 갱신이 최대 1시간 늦어도 정상 갱신자가 기간 경계에서 잠기지 않게 둔 여유. */
export const RENEWAL_GRACE_MS = 3 * DAY_MS;
export const TRIAL_MS = 7 * DAY_MS;

/** 대표 출처 동률 순서. */
export const SOURCE_PRIORITY: readonly SourceKey[] = ["paddle", "apple", "google", "manual", "trial"];
export const PAYMENT_SOURCES: readonly PaymentSourceKey[] = ["paddle", "apple", "google"];

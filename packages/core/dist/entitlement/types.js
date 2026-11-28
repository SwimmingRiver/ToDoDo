export const EMPTY_ENTITLEMENT = {
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
const DAY_MS = 86400000;
/** 토큰 갱신이 최대 1시간 늦어도 정상 갱신자가 기간 경계에서 잠기지 않게 둔 여유. */
export const RENEWAL_GRACE_MS = 3 * DAY_MS;
export const TRIAL_MS = 7 * DAY_MS;
/** 대표 출처 동률 순서. */
export const SOURCE_PRIORITY = ["paddle", "apple", "google", "manual", "trial"];
export const PAYMENT_SOURCES = ["paddle", "apple", "google"];

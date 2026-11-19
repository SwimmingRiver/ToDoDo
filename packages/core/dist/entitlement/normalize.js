import { EMPTY_ENTITLEMENT, } from "./types.js";
const STATUSES = ["none", "trialing", "active", "past_due", "canceled"];
const SOURCE_KEYS = ["paddle", "apple", "google", "manual", "trial"];
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value) => (typeof value === "string" ? value : null);
const reqStr = (value) => (typeof value === "string" && value !== "" ? value : null);
const status = (value) => STATUSES.includes(value) ? value : "none";
const sourceKey = (value) => SOURCE_KEYS.includes(value) ? value : null;
const environment = (value) => (value === "Sandbox" ? "Sandbox" : "Production");
const baseRecord = (raw) => ({
    status: status(raw.status),
    premiumUntil: str(raw.premiumUntil),
    cancelAt: str(raw.cancelAt),
    currentPeriodEnd: str(raw.currentPeriodEnd),
    autoRenew: raw.autoRenew === true,
    startedAt: str(raw.startedAt),
    updatedAt: str(raw.updatedAt) ?? "",
});
const normalizeSources = (raw) => {
    const sources = {};
    if (isObject(raw.paddle)) {
        const customerId = reqStr(raw.paddle.customerId);
        const subscriptionId = reqStr(raw.paddle.subscriptionId);
        if (customerId && subscriptionId) {
            const record = {
                ...baseRecord(raw.paddle),
                customerId,
                subscriptionId,
                lastWebhookEventId: str(raw.paddle.lastWebhookEventId),
                lastEventOccurredAt: str(raw.paddle.lastEventOccurredAt),
            };
            sources.paddle = record;
        }
    }
    if (isObject(raw.apple)) {
        const originalTransactionId = reqStr(raw.apple.originalTransactionId);
        const productId = reqStr(raw.apple.productId);
        if (originalTransactionId && productId) {
            const record = {
                ...baseRecord(raw.apple),
                originalTransactionId,
                productId,
                environment: environment(raw.apple.environment),
                appAccountToken: str(raw.apple.appAccountToken),
                lastNotificationUUID: str(raw.apple.lastNotificationUUID),
                lastSignedDate: str(raw.apple.lastSignedDate),
            };
            sources.apple = record;
        }
    }
    if (isObject(raw.google)) {
        const purchaseToken = reqStr(raw.google.purchaseToken);
        const productId = reqStr(raw.google.productId);
        if (purchaseToken && productId) {
            const record = {
                ...baseRecord(raw.google),
                purchaseToken,
                productId,
                basePlanId: str(raw.google.basePlanId),
                environment: environment(raw.google.environment),
                obfuscatedAccountId: str(raw.google.obfuscatedAccountId),
                lastMessageId: str(raw.google.lastMessageId),
                lastEventTime: str(raw.google.lastEventTime),
            };
            sources.google = record;
        }
    }
    if (isObject(raw.manual))
        sources.manual = baseRecord(raw.manual);
    if (isObject(raw.trial))
        sources.trial = baseRecord(raw.trial);
    return sources;
};
/** `sources`가 없는 예전 문서: 최상위 필드를 그 출처 하나의 기록으로 간주한다. */
const migrateLegacy = (raw, source) => {
    if (source === null)
        return {};
    const common = {
        status: status(raw.status),
        premiumUntil: str(raw.premiumUntil),
        cancelAt: str(raw.cancelAt),
        currentPeriodEnd: str(raw.currentPeriodEnd),
        autoRenew: false,
        startedAt: null,
        updatedAt: str(raw.updatedAt) ?? "",
    };
    if (source === "paddle") {
        const customerId = reqStr(raw.customerId);
        const subscriptionId = reqStr(raw.subscriptionId);
        if (!customerId || !subscriptionId)
            return {};
        return {
            paddle: {
                ...common,
                autoRenew: common.cancelAt === null,
                customerId,
                subscriptionId,
                lastWebhookEventId: str(raw.lastWebhookEventId),
                lastEventOccurredAt: str(raw.lastEventOccurredAt),
            },
        };
    }
    if (source === "trial" || source === "manual")
        return { [source]: common };
    return {}; // apple·google은 예전 문서에 존재할 수 없다.
};
/** Firestore에서 읽은 임의의 값을 EntitlementDoc으로. 잘못된 필드는 기본값, 예전 문서는 sources로 이주. */
export const normalizeEntitlement = (data) => {
    if (!isObject(data))
        return { ...EMPTY_ENTITLEMENT, sources: {} };
    const source = sourceKey(data.source);
    const sources = isObject(data.sources) ? normalizeSources(data.sources) : migrateLegacy(data, source);
    const dup = data.duplicate;
    const duplicate = isObject(dup) &&
        (dup.laterSource === "paddle" || dup.laterSource === "apple" || dup.laterSource === "google") &&
        typeof dup.detectedAt === "string"
        ? { laterSource: dup.laterSource, detectedAt: dup.detectedAt }
        : null;
    return {
        plan: data.plan === "premium" ? "premium" : "free",
        status: status(data.status),
        source,
        premiumUntil: str(data.premiumUntil),
        trialUsedAt: str(data.trialUsedAt),
        cancelAt: str(data.cancelAt),
        currentPeriodEnd: str(data.currentPeriodEnd),
        customerId: str(data.customerId),
        subscriptionId: str(data.subscriptionId),
        lastWebhookEventId: str(data.lastWebhookEventId),
        lastEventOccurredAt: str(data.lastEventOccurredAt),
        updatedAt: str(data.updatedAt) ?? "",
        sources,
        duplicate,
    };
};

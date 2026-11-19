import { PAYMENT_SOURCES, SOURCE_PRIORITY, } from "./types.js";
export const isPremiumAt = (doc, now) => doc.premiumUntil !== null && Date.parse(doc.premiumUntil) > now.getTime();
/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export const toClaimSeconds = (premiumUntil) => premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);
const isRenewingAndValid = (record, now) => record.autoRenew && record.cancelAt === null && record.status !== "canceled" && isPremiumAt(record, now);
/**
 * 자동 갱신 중인 스토어 구독(apple → google 순). 계정 삭제 전 경고·스토어 관리 화면에 쓴다.
 * 유효 기간은 보지 않는다 — Apple 결제 재시도·Google 보류는 premiumUntil이 지금이어도 스토어가
 * 계속 청구를 시도하므로, 이때 탈퇴하면 나중에 청구된다. 이중 구독 판정(detectDuplicate)은 그대로 유효 기간을 본다.
 */
export const hasAutoRenewingStoreSubscription = (doc, _now) => {
    for (const key of ["apple", "google"]) {
        if (isAutoRenewingStore(doc, key))
            return key;
    }
    return null;
};
/**
 * 스토어 하나가 자동 갱신 중인지(유효 기간은 보지 않는다 — 위와 같은 이유).
 * 탈퇴 시 서버의 Google 해지 대상과 화면의 Apple 경고·Google 안내가 같은 기준을 쓰도록 스토어별로 따로 묻는다.
 */
export const isAutoRenewingStore = (doc, key) => {
    const record = doc.sources[key];
    return !!record && record.autoRenew && record.cancelAt === null && record.status !== "canceled";
};
const detectDuplicate = (doc, now) => {
    const active = PAYMENT_SOURCES.flatMap((key) => {
        const record = doc.sources[key];
        return record && isRenewingAndValid(record, now) ? [{ key, startedAt: record.startedAt }] : [];
    });
    if (active.length < 2)
        return null;
    // null(알 수 없음)은 가장 이르다고 본다. 동시각이면 우선순위가 낮은 쪽을 나중으로.
    const startMs = (value) => (value === null ? -Infinity : Date.parse(value));
    const later = active.reduce((a, b) => (startMs(b.startedAt) >= startMs(a.startedAt) ? b : a));
    const laterSource = later.key;
    return {
        laterSource,
        detectedAt: doc.duplicate?.laterSource === laterSource ? doc.duplicate.detectedAt : now.toISOString(),
    };
};
/** 출처별 기록을 최상위 필드로 합친다. 규칙은 설계 스펙 1절. updatedAt·trialUsedAt은 건드리지 않는다. */
export const aggregate = (doc, now) => {
    let representative = null;
    for (const key of SOURCE_PRIORITY) {
        const record = doc.sources[key];
        if (!record || record.premiumUntil === null)
            continue;
        if (representative === null || Date.parse(record.premiumUntil) > Date.parse(representative.record.premiumUntil)) {
            representative = { key, record };
        }
    }
    const paddle = doc.sources.paddle;
    const merged = {
        ...doc,
        status: representative?.record.status ?? "none",
        source: representative?.key ?? null,
        premiumUntil: representative?.record.premiumUntil ?? null,
        cancelAt: representative?.record.cancelAt ?? null,
        currentPeriodEnd: representative?.record.currentPeriodEnd ?? null,
        customerId: paddle?.customerId ?? null,
        subscriptionId: paddle?.subscriptionId ?? null,
        lastWebhookEventId: paddle?.lastWebhookEventId ?? null,
        lastEventOccurredAt: paddle?.lastEventOccurredAt ?? null,
    };
    return {
        ...merged,
        plan: isPremiumAt(merged, now) ? "premium" : "free",
        duplicate: detectDuplicate(doc, now),
    };
};

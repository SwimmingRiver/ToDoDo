import {
  PAYMENT_SOURCES,
  SOURCE_PRIORITY,
  type DuplicateInfo,
  type EntitlementDoc,
  type PaymentSourceKey,
  type SourceKey,
  type SourceRecord,
} from "./types.js";

export const isPremiumAt = (doc: Pick<EntitlementDoc, "premiumUntil">, now: Date): boolean =>
  doc.premiumUntil !== null && Date.parse(doc.premiumUntil) > now.getTime();

/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export const toClaimSeconds = (premiumUntil: string | null): number =>
  premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);

const isRenewingAndValid = (record: SourceRecord, now: Date): boolean =>
  record.autoRenew && record.cancelAt === null && record.status !== "canceled" && isPremiumAt(record, now);

/** 자동 갱신 중인 스토어 구독(apple → google 순). 계정 삭제 전 경고에 쓴다. */
export const hasAutoRenewingStoreSubscription = (doc: EntitlementDoc, now: Date): "apple" | "google" | null => {
  for (const key of ["apple", "google"] as const) {
    const record = doc.sources[key];
    if (record && isRenewingAndValid(record, now)) return key;
  }
  return null;
};

const detectDuplicate = (doc: EntitlementDoc, now: Date): DuplicateInfo | null => {
  const active = PAYMENT_SOURCES.flatMap((key) => {
    const record = doc.sources[key];
    return record && isRenewingAndValid(record, now) ? [{ key, startedAt: record.startedAt }] : [];
  });
  if (active.length < 2) return null;
  // null(알 수 없음)은 가장 이르다고 본다. 동시각이면 우선순위가 낮은 쪽을 나중으로.
  const startMs = (value: string | null): number => (value === null ? -Infinity : Date.parse(value));
  const later = active.reduce((a, b) => (startMs(b.startedAt) >= startMs(a.startedAt) ? b : a));
  const laterSource: PaymentSourceKey = later.key;
  return {
    laterSource,
    detectedAt: doc.duplicate?.laterSource === laterSource ? doc.duplicate.detectedAt : now.toISOString(),
  };
};

/** 출처별 기록을 최상위 필드로 합친다. 규칙은 설계 스펙 1절. updatedAt·trialUsedAt은 건드리지 않는다. */
export const aggregate = (doc: EntitlementDoc, now: Date): EntitlementDoc => {
  let representative: { key: SourceKey; record: SourceRecord } | null = null;
  for (const key of SOURCE_PRIORITY) {
    const record = doc.sources[key];
    if (!record || record.premiumUntil === null) continue;
    if (representative === null || Date.parse(record.premiumUntil) > Date.parse(representative.record.premiumUntil!)) {
      representative = { key, record };
    }
  }
  const paddle = doc.sources.paddle;
  const merged: EntitlementDoc = {
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

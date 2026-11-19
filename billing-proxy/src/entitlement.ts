/**
 * entitlements/{uid} 문서의 상태 전이. 웹훅·체험·운영자 부여가 모두 이 규칙을 따른다.
 * 권한 판단은 premiumUntil 하나로만 한다 — 만료 시각이 지나면 아무도 쓰지 않아도 잠기므로
 * 체험 종료·해지 후 회수 스케줄러가 필요 없다.
 */
import {
  EMPTY_ENTITLEMENT,
  RENEWAL_GRACE_MS,
  TRIAL_MS,
  isPremiumAt,
  toClaimSeconds,
  type EntitlementDoc,
  type EntitlementSource,
  type EntitlementStatus,
} from "@tododo/core/dist/entitlement/index.js";

// 모델·상수·판정은 core가 단일 출처다. 기존 `./entitlement` import 경로가 그대로 동작하도록 재수출한다.
export { EMPTY_ENTITLEMENT, RENEWAL_GRACE_MS, TRIAL_MS, isPremiumAt, toClaimSeconds };
export type { EntitlementDoc, EntitlementSource, EntitlementStatus };

export interface PaddleSubscriptionEvent {
  eventId: string;
  occurredAt: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  customerId: string;
  subscriptionId: string;
  currentPeriodEndsAt: string | null;
  /** scheduled_change.action === "cancel"일 때의 effective_at. */
  scheduledCancelAt: string | null;
}

export type Decision<R extends string> = { write: EntitlementDoc } | { skip: R };
export type TrialRejection = "TRIAL_ALREADY_USED" | "ALREADY_PREMIUM";

const iso = (ms: number): string => new Date(ms).toISOString();

const withPlan = (doc: EntitlementDoc, now: Date): EntitlementDoc => ({
  ...doc,
  plan: isPremiumAt(doc, now) ? "premium" : "free",
});

/**
 * ISO 시각을 나노초 정수로. Paddle occurred_at은 마이크로초까지 오는데 Date.parse는 밀리초에서 잘라
 * 같은 밀리초의 두 이벤트를 같은 순간으로 본다 — 소수부는 문자열에서 직접 읽어 정밀도를 지킨다.
 */
const toEpochNanos = (value: string): bigint => {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? "";
  const wholeSecondsMs = Date.parse(value.replace(/\.\d+/, ""));
  return BigInt(wholeSecondsMs) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, "0"));
};

/** subscription.* 본문은 구독 전체 스냅샷이라 가장 최신 이벤트 하나만 반영하면 정확하다. */
export const isStaleEvent = (existing: EntitlementDoc, event: PaddleSubscriptionEvent): boolean =>
  existing.lastWebhookEventId === event.eventId ||
  (existing.lastEventOccurredAt !== null &&
    toEpochNanos(event.occurredAt) <= toEpochNanos(existing.lastEventOccurredAt));

/**
 * 이중 구독(두 탭에서 각각 결제 등)일 때 한쪽 해지가 살아 있는 다른 구독의 권한을 지우지 않게 한다.
 * 문서는 구독 하나만 추적하므로, 지금 추적 중인 구독이 유효한 동안 다른 구독의 해지·일시정지·결제 실패는 무시한다.
 * past_due도 포함하는 이유: 반영하면 추적 대상이 그 구독으로 바뀌고, 이어서 오는 그 구독의 해지가
 * 더는 "다른 구독"이 아니게 되어 살아 있는 구독의 권한까지 회수된다.
 */
export const isForeignCancel = (existing: EntitlementDoc, event: PaddleSubscriptionEvent, now: Date): boolean =>
  existing.source === "paddle" &&
  existing.subscriptionId !== null &&
  existing.subscriptionId !== event.subscriptionId &&
  isPremiumAt(existing, now) &&
  (event.status === "canceled" || event.status === "paused" || event.status === "past_due");

export const applySubscriptionEvent = (
  existing: EntitlementDoc,
  event: PaddleSubscriptionEvent,
  now: Date,
): EntitlementDoc => {
  const base: EntitlementDoc = {
    ...existing,
    source: "paddle",
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
    currentPeriodEnd: event.currentPeriodEndsAt,
    lastWebhookEventId: event.eventId,
    lastEventOccurredAt: event.occurredAt,
    updatedAt: now.toISOString(),
  };
  const periodPlusGrace =
    event.currentPeriodEndsAt === null
      ? existing.premiumUntil
      : iso(Date.parse(event.currentPeriodEndsAt) + RENEWAL_GRACE_MS);

  switch (event.status) {
    case "active":
    case "trialing":
      return withPlan(
        event.scheduledCancelAt !== null
          ? { ...base, status: "active", premiumUntil: event.scheduledCancelAt, cancelAt: event.scheduledCancelAt }
          : { ...base, status: "active", premiumUntil: periodPlusGrace, cancelAt: null },
        now,
      );
    case "past_due": {
      // Paddle이 결제를 재시도하는 동안은 이용을 유지한다(Paddle 권장).
      const candidates = [existing.premiumUntil, periodPlusGrace]
        .filter((value): value is string => value !== null)
        .map((value) => Date.parse(value));
      const premiumUntil = candidates.length > 0 ? iso(Math.max(...candidates)) : null;
      return withPlan({ ...base, status: "past_due", premiumUntil, cancelAt: null }, now);
    }
    case "paused":
    case "canceled":
      return withPlan({ ...base, status: "canceled", premiumUntil: now.toISOString(), cancelAt: null }, now);
  }
};

export const applyTrial = (existing: EntitlementDoc, now: Date): Decision<TrialRejection> => {
  if (existing.trialUsedAt !== null) return { skip: "TRIAL_ALREADY_USED" };
  if (isPremiumAt(existing, now)) return { skip: "ALREADY_PREMIUM" };
  return {
    write: {
      ...existing,
      plan: "premium",
      status: "trialing",
      source: "trial",
      premiumUntil: iso(now.getTime() + TRIAL_MS),
      trialUsedAt: now.toISOString(),
      cancelAt: null,
      updatedAt: now.toISOString(),
    },
  };
};

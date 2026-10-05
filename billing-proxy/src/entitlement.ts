/**
 * entitlements/{uid} 문서의 상태 전이. 웹훅·체험·운영자 부여가 모두 이 규칙을 따른다.
 * 권한 판단은 premiumUntil 하나로만 한다 — 만료 시각이 지나면 아무도 쓰지 않아도 잠기므로
 * 체험 종료·해지 후 회수 스케줄러가 필요 없다.
 */
export type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type EntitlementSource = "manual" | "trial" | "paddle" | null;

export interface EntitlementDoc {
  plan: "free" | "premium";
  status: EntitlementStatus;
  source: EntitlementSource;
  premiumUntil: string | null;
  trialUsedAt: string | null;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
  updatedAt: string;
}

export const EMPTY_ENTITLEMENT: EntitlementDoc = {
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

const DAY_MS = 86_400_000;
/** 토큰 갱신이 최대 1시간 늦어도 정상 갱신자가 기간 경계에서 잠기지 않게 둔 여유. */
export const RENEWAL_GRACE_MS = 3 * DAY_MS;
export const TRIAL_MS = 7 * DAY_MS;

const iso = (ms: number): string => new Date(ms).toISOString();

export const isPremiumAt = (doc: EntitlementDoc, now: Date): boolean =>
  doc.premiumUntil !== null && Date.parse(doc.premiumUntil) > now.getTime();

const withPlan = (doc: EntitlementDoc, now: Date): EntitlementDoc => ({
  ...doc,
  plan: isPremiumAt(doc, now) ? "premium" : "free",
});

/** subscription.* 본문은 구독 전체 스냅샷이라 가장 최신 이벤트 하나만 반영하면 정확하다. */
export const isStaleEvent = (existing: EntitlementDoc, event: PaddleSubscriptionEvent): boolean =>
  existing.lastWebhookEventId === event.eventId ||
  (existing.lastEventOccurredAt !== null &&
    Date.parse(event.occurredAt) <= Date.parse(existing.lastEventOccurredAt));

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

/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export const toClaimSeconds = (premiumUntil: string | null): number =>
  premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);

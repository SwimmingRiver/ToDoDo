/**
 * entitlements/{uid} 문서의 상태 전이. 웹훅·체험·운영자 부여가 모두 이 규칙을 따른다.
 * 권한 판단은 premiumUntil 하나로만 한다 — 만료 시각이 지나면 아무도 쓰지 않아도 잠기므로
 * 체험 종료·해지 후 회수 스케줄러가 필요 없다.
 */
import {
  EMPTY_ENTITLEMENT,
  RENEWAL_GRACE_MS,
  TRIAL_MS,
  aggregate,
  isPremiumAt,
  toClaimSeconds,
  type EntitlementDoc,
  type EntitlementSource,
  type EntitlementStatus,
  type PaddleRecord,
  type SourceRecord,
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
  /** data.started_at. 이중 구독일 때 "나중에 시작한 쪽"을 가리는 데 쓴다. */
  startedAt: string | null;
}

export type Decision<R extends string> = { write: EntitlementDoc } | { skip: R };
export type TrialRejection = "TRIAL_ALREADY_USED" | "ALREADY_PREMIUM";

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * ISO 시각을 나노초 정수로. Paddle occurred_at은 마이크로초까지 오는데 Date.parse는 밀리초에서 잘라
 * 같은 밀리초의 두 이벤트를 같은 순간으로 본다 — 소수부는 문자열에서 직접 읽어 정밀도를 지킨다.
 */
const toEpochNanos = (value: string): bigint => {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? "";
  const wholeSecondsMs = Date.parse(value.replace(/\.\d+/, ""));
  return BigInt(wholeSecondsMs) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, "0"));
};

/**
 * subscription.* 본문은 구독 전체 스냅샷이라 가장 최신 이벤트 하나만 반영하면 정확하다.
 * 순서는 Paddle 기록끼리만 비교한다 — 다른 출처(apple·google)의 갱신 시각과는 무관하다.
 */
export const isStaleEvent = (existing: EntitlementDoc, event: PaddleSubscriptionEvent): boolean => {
  const paddle = existing.sources.paddle;
  if (!paddle) return false;
  return (
    paddle.lastWebhookEventId === event.eventId ||
    (paddle.lastEventOccurredAt !== null && toEpochNanos(event.occurredAt) <= toEpochNanos(paddle.lastEventOccurredAt))
  );
};

/**
 * 이중 구독(두 탭에서 각각 결제 등)일 때 한쪽 해지가 살아 있는 다른 구독의 권한을 지우지 않게 한다.
 * Paddle 기록은 구독 하나만 추적하므로, 그 구독이 유효한 동안 다른 Paddle 구독의 해지·일시정지·결제 실패는 무시한다.
 * past_due도 포함하는 이유: 반영하면 추적 대상이 그 구독으로 바뀌고, 이어서 오는 그 구독의 해지가
 * 더는 "다른 구독"이 아니게 되어 살아 있는 구독의 권한까지 회수된다.
 * 대표 출처(최상위 source)가 아니라 Paddle 기록으로 판정한다 — Apple이 대표여도 Paddle 구독은 따로 지켜야 한다.
 */
export const isForeignCancel = (existing: EntitlementDoc, event: PaddleSubscriptionEvent, now: Date): boolean => {
  const paddle = existing.sources.paddle;
  return (
    paddle !== undefined &&
    paddle.subscriptionId !== event.subscriptionId &&
    isPremiumAt(paddle, now) &&
    (event.status === "canceled" || event.status === "paused" || event.status === "past_due")
  );
};

/** Paddle 상태를 기록 하나로 계산한다. 계산식은 출처 기록 도입 전과 같다. */
const nextPaddleRecord = (previous: PaddleRecord | undefined, event: PaddleSubscriptionEvent, now: Date): PaddleRecord => {
  const nowIso = now.toISOString();
  const previousUntil = previous?.premiumUntil ?? null;
  const periodPlusGrace =
    event.currentPeriodEndsAt === null ? previousUntil : iso(Date.parse(event.currentPeriodEndsAt) + RENEWAL_GRACE_MS);

  const state = ((): Pick<PaddleRecord, "status" | "premiumUntil" | "cancelAt"> => {
    switch (event.status) {
      case "active":
      case "trialing":
        return event.scheduledCancelAt !== null
          ? { status: "active", premiumUntil: event.scheduledCancelAt, cancelAt: event.scheduledCancelAt }
          : { status: "active", premiumUntil: periodPlusGrace, cancelAt: null };
      case "past_due": {
        // Paddle이 결제를 재시도하는 동안은 이용을 유지한다(Paddle 권장). "기존 값"은 Paddle 기록의 값만 본다.
        const candidates = [previousUntil, periodPlusGrace]
          .filter((value): value is string => value !== null)
          .map((value) => Date.parse(value));
        return { status: "past_due", premiumUntil: candidates.length > 0 ? iso(Math.max(...candidates)) : null, cancelAt: null };
      }
      case "paused":
      case "canceled":
        return { status: "canceled", premiumUntil: nowIso, cancelAt: null };
    }
  })();

  return {
    ...state,
    currentPeriodEnd: event.currentPeriodEndsAt,
    autoRenew:
      event.scheduledCancelAt === null &&
      (event.status === "active" || event.status === "trialing" || event.status === "past_due"),
    startedAt: event.startedAt ?? previous?.startedAt ?? null,
    updatedAt: nowIso,
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
    lastWebhookEventId: event.eventId,
    lastEventOccurredAt: event.occurredAt,
  };
};

/** Paddle 이벤트는 sources.paddle만 바꾼다. 다른 출처의 권한은 aggregate가 그대로 합쳐 남긴다. */
export const applySubscriptionEvent = (
  existing: EntitlementDoc,
  event: PaddleSubscriptionEvent,
  now: Date,
): EntitlementDoc =>
  aggregate(
    {
      ...existing,
      sources: { ...existing.sources, paddle: nextPaddleRecord(existing.sources.paddle, event, now) },
      updatedAt: now.toISOString(),
    },
    now,
  );

/**
 * 웹 카드 없는 체험. 체험은 웹·앱 합쳐 계정당 한 번이라 trialUsedAt(앱 체험 구매도 채운다)으로 막는다.
 * 프리미엄 판정은 출처 기록을 합쳐서 한다 — 최상위 값이 낡았어도 Apple·Google로 유효하면 거절한다.
 */
export const applyTrial = (existing: EntitlementDoc, now: Date): Decision<TrialRejection> => {
  if (existing.trialUsedAt !== null) return { skip: "TRIAL_ALREADY_USED" };
  if (isPremiumAt(existing, now) || isPremiumAt(aggregate(existing, now), now)) return { skip: "ALREADY_PREMIUM" };
  const nowIso = now.toISOString();
  const trial: SourceRecord = {
    status: "trialing",
    premiumUntil: iso(now.getTime() + TRIAL_MS),
    cancelAt: null,
    currentPeriodEnd: null,
    autoRenew: false,
    startedAt: nowIso,
    updatedAt: nowIso,
  };
  return {
    write: aggregate({ ...existing, sources: { ...existing.sources, trial }, trialUsedAt: nowIso, updatedAt: nowIso }, now),
  };
};

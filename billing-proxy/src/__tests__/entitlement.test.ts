import { describe, it, expect } from "vitest";
import {
  EMPTY_ENTITLEMENT,
  RENEWAL_GRACE_MS,
  TRIAL_MS,
  applySubscriptionEvent,
  applyTrial,
  isForeignCancel,
  isPremiumAt,
  isStaleEvent,
  toClaimSeconds,
  type EntitlementDoc,
  type PaddleSubscriptionEvent,
} from "../entitlement";
import { asStored } from "./helpers/storedDoc";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const PERIOD_END = "2026-11-10T00:00:00.000Z";
const iso = (ms: number) => new Date(ms).toISOString();

const event = (overrides: Partial<PaddleSubscriptionEvent> = {}): PaddleSubscriptionEvent => ({
  eventId: "evt_1",
  occurredAt: "2026-10-10T00:00:00.000Z",
  status: "active",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  currentPeriodEndsAt: PERIOD_END,
  scheduledCancelAt: null,
  startedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

/** 스토어가 읽은 모양(예전 문서면 sources로 이주된 상태). */
const doc = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc => asStored({ ...EMPTY_ENTITLEMENT, ...overrides });

/** Paddle 구독 하나만 있는 예전 문서. */
const paddleDoc = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc =>
  doc({ source: "paddle", status: "active", customerId: "ctm_1", subscriptionId: "sub_1", ...overrides });

const APPLE_UNTIL = iso(NOW.getTime() + 20 * 86_400_000);
const appleRecord = {
  status: "active" as const,
  premiumUntil: APPLE_UNTIL,
  cancelAt: null,
  currentPeriodEnd: APPLE_UNTIL,
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  originalTransactionId: "otx_1",
  productId: "premium_monthly",
  environment: "Production" as const,
  appAccountToken: null,
  lastNotificationUUID: null,
  lastSignedDate: null,
};

describe("applySubscriptionEvent", () => {
  it("active면 기간 끝 + 3일까지 프리미엄이고 Paddle 식별자를 기록한다", () => {
    const next = applySubscriptionEvent(doc(), event(), NOW);
    expect(next).toMatchObject({
      plan: "premium",
      status: "active",
      source: "paddle",
      premiumUntil: iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
      currentPeriodEnd: PERIOD_END,
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      cancelAt: null,
      lastWebhookEventId: "evt_1",
      lastEventOccurredAt: "2026-10-10T00:00:00.000Z",
      updatedAt: NOW.toISOString(),
      sources: {
        paddle: {
          status: "active",
          premiumUntil: iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
          cancelAt: null,
          currentPeriodEnd: PERIOD_END,
          autoRenew: true,
          startedAt: "2026-10-01T00:00:00.000Z",
          updatedAt: NOW.toISOString(),
          customerId: "ctm_1",
          subscriptionId: "sub_1",
          lastWebhookEventId: "evt_1",
          lastEventOccurredAt: "2026-10-10T00:00:00.000Z",
        },
      },
    });
  });

  it("startedAt이 이벤트에 없으면 기존 Paddle 기록의 값을 유지한다", () => {
    const existing = applySubscriptionEvent(doc(), event(), NOW);
    const next = applySubscriptionEvent(existing, event({ eventId: "evt_2", startedAt: null }), NOW);
    expect(next.sources.paddle?.startedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("paddle cancel keeps apple premium — Paddle 해지가 Apple 권한을 지우지 않는다", () => {
    const existing = doc({ sources: { apple: appleRecord }, source: "apple", premiumUntil: APPLE_UNTIL, plan: "premium" });
    const next = applySubscriptionEvent(existing, event({ status: "canceled" }), NOW);
    expect(next).toMatchObject({
      plan: "premium",
      source: "apple",
      premiumUntil: APPLE_UNTIL,
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      sources: { apple: appleRecord, paddle: { status: "canceled", premiumUntil: NOW.toISOString(), autoRenew: false } },
    });
  });

  it("체험 중이던 사용자가 구독하면 trialUsedAt은 유지되고 구독으로 덮어쓴다", () => {
    const trialing = doc({ status: "trialing", source: "trial", trialUsedAt: "2026-10-05T00:00:00.000Z", premiumUntil: "2026-10-12T00:00:00.000Z" });
    const next = applySubscriptionEvent(trialing, event(), NOW);
    expect(next.status).toBe("active");
    expect(next.source).toBe("paddle");
    expect(next.trialUsedAt).toBe("2026-10-05T00:00:00.000Z");
  });

  it("예약 해지가 걸리면 해지 시각까지만 프리미엄이고 유예를 붙이지 않는다", () => {
    const next = applySubscriptionEvent(doc(), event({ scheduledCancelAt: PERIOD_END }), NOW);
    expect(next.status).toBe("active");
    expect(next.premiumUntil).toBe(PERIOD_END);
    expect(next.cancelAt).toBe(PERIOD_END);
    expect(next.sources.paddle).toMatchObject({ premiumUntil: PERIOD_END, cancelAt: PERIOD_END, autoRenew: false });
  });

  it("past_due의 \"기존 값\"은 Paddle 기록의 값이다(다른 출처의 만료는 끌어오지 않는다)", () => {
    const manual = { status: "active" as const, premiumUntil: "2026-12-31T00:00:00.000Z", cancelAt: null, currentPeriodEnd: null, autoRenew: false, startedAt: null, updatedAt: "" };
    const next = applySubscriptionEvent(doc({ sources: { manual } }), event({ status: "past_due" }), NOW);
    expect(next.sources.paddle?.premiumUntil).toBe(iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS));
    expect(next.premiumUntil).toBe("2026-12-31T00:00:00.000Z");
    expect(next.source).toBe("manual");
  });

  it("past_due면 기존 값과 기간 끝+3일 중 큰 값을 유지한다", () => {
    const later = "2026-12-31T00:00:00.000Z";
    expect(applySubscriptionEvent(paddleDoc({ premiumUntil: later }), event({ status: "past_due" }), NOW).premiumUntil).toBe(later);
    expect(applySubscriptionEvent(paddleDoc({ premiumUntil: later }), event({ status: "past_due" }), NOW).sources.paddle).toMatchObject({
      status: "past_due",
      premiumUntil: later,
      autoRenew: true,
    });
    expect(applySubscriptionEvent(doc({ premiumUntil: null }), event({ status: "past_due" }), NOW).premiumUntil).toBe(
      iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
    );
    expect(applySubscriptionEvent(doc(), event({ status: "past_due" }), NOW).status).toBe("past_due");
  });

  it("canceled면 즉시 회수한다(premiumUntil = now, plan = free)", () => {
    const active = paddleDoc({ status: "active", premiumUntil: "2026-11-13T00:00:00.000Z", cancelAt: PERIOD_END });
    const next = applySubscriptionEvent(active, event({ status: "canceled" }), NOW);
    expect(next).toMatchObject({ status: "canceled", plan: "free", premiumUntil: NOW.toISOString(), cancelAt: null });
  });

  it("paused는 canceled와 같게 처리한다", () => {
    const next = applySubscriptionEvent(doc(), event({ status: "paused" }), NOW);
    expect(next.status).toBe("canceled");
    expect(next.premiumUntil).toBe(NOW.toISOString());
  });

  it("Paddle trialing(쓰지 않는 상태)이 와도 active와 같게 처리한다", () => {
    const next = applySubscriptionEvent(doc(), event({ status: "trialing" }), NOW);
    expect(next.status).toBe("active");
  });

  it("기간 정보가 없으면 기존 premiumUntil을 유지한다", () => {
    const next = applySubscriptionEvent(paddleDoc({ premiumUntil: "2026-10-20T00:00:00.000Z" }), event({ currentPeriodEndsAt: null }), NOW);
    expect(next.premiumUntil).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("isStaleEvent", () => {
  it("같은 event_id면 오래된 것으로 본다", () => {
    expect(isStaleEvent(paddleDoc({ lastWebhookEventId: "evt_1" }), event())).toBe(true);
  });

  it("occurred_at이 마지막 반영 시각 이하면 오래된 것으로 본다", () => {
    const existing = paddleDoc({ lastWebhookEventId: "evt_0", lastEventOccurredAt: "2026-10-10T00:00:01.000Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2" }))).toBe(true);
    expect(isStaleEvent(paddleDoc({ lastEventOccurredAt: "2026-10-10T00:00:00.000Z" }), event({ eventId: "evt_2" }))).toBe(true);
  });

  it("같은 밀리초 안의 이벤트도 마이크로초까지 비교한다(Paddle occurred_at은 µs 정밀도)", () => {
    const existing = paddleDoc({ lastWebhookEventId: "evt_1", lastEventOccurredAt: "2026-10-10T00:00:00.123456Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123457Z" }))).toBe(false);
    expect(isStaleEvent(existing, event({ eventId: "evt_0", occurredAt: "2026-10-10T00:00:00.123455Z" }))).toBe(true);
    expect(isStaleEvent(existing, event({ eventId: "evt_3", occurredAt: "2026-10-10T00:00:00.123456Z" }))).toBe(true);
  });

  it("정밀도가 서로 달라도 같은 순간이면 같게 본다", () => {
    const existing = paddleDoc({ lastWebhookEventId: "evt_1", lastEventOccurredAt: "2026-10-10T00:00:00.123Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123000Z" }))).toBe(true);
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123001Z" }))).toBe(false);
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:01Z" }))).toBe(false);
  });

  it("처음 받는 이벤트는 오래되지 않았다", () => {
    expect(isStaleEvent(doc(), event())).toBe(false);
  });

  it("Paddle 기록 기준으로 판정한다(최상위 값만 있고 Paddle 기록이 없으면 처음 받는 이벤트)", () => {
    const stale = { ...doc(), lastWebhookEventId: "evt_1", lastEventOccurredAt: "2026-10-11T00:00:00.000Z" };
    expect(isStaleEvent(stale, event())).toBe(false);
  });
});

describe("isForeignCancel", () => {
  const liveFields: Partial<EntitlementDoc> = { subscriptionId: "sub_old", premiumUntil: "2026-11-13T00:00:00.000Z" };
  const live = paddleDoc(liveFields);

  it("살아 있는 다른 구독이 있는데 해지·일시정지 이벤트가 오면 true(이중 구독의 남은 쪽을 지킨다)", () => {
    expect(isForeignCancel(live, event({ status: "canceled" }), NOW)).toBe(true);
    expect(isForeignCancel(live, event({ status: "paused" }), NOW)).toBe(true);
  });

  it("같은 구독의 해지는 정상 반영한다", () => {
    expect(isForeignCancel(live, event({ status: "canceled", subscriptionId: "sub_old" }), NOW)).toBe(false);
  });

  it("살아 있는 다른 구독이 있는데 past_due가 오면 true(추적 대상이 바뀌면 그 구독의 해지가 살아 있는 권한을 지운다)", () => {
    expect(isForeignCancel(live, event({ status: "past_due" }), NOW)).toBe(true);
  });

  it("같은 구독의 past_due는 정상 반영한다", () => {
    expect(isForeignCancel(live, event({ status: "past_due", subscriptionId: "sub_old" }), NOW)).toBe(false);
  });

  it("active는 다른 구독이어도 반영한다(새로 결제한 구독)", () => {
    expect(isForeignCancel(live, event({ status: "active" }), NOW)).toBe(false);
  });

  it("기존 문서가 이미 만료됐거나 Paddle 구독이 아니면 false", () => {
    expect(isForeignCancel(paddleDoc({ ...liveFields, premiumUntil: "2026-10-01T00:00:00.000Z" }), event({ status: "canceled" }), NOW)).toBe(false);
    expect(isForeignCancel(doc({ ...liveFields, source: "manual", status: "active" }), event({ status: "canceled" }), NOW)).toBe(false);
    expect(isForeignCancel(paddleDoc({ ...liveFields, subscriptionId: null }), event({ status: "canceled" }), NOW)).toBe(false);
  });

  it("isForeignCancel reads sources.paddle — 대표 출처가 apple이어도 Paddle 기록으로 판정한다", () => {
    const paddle = live.sources.paddle!;
    const both = doc({ sources: { paddle, apple: appleRecord }, source: "apple", premiumUntil: APPLE_UNTIL, subscriptionId: "sub_old" });
    expect(isForeignCancel(both, event({ status: "canceled" }), NOW)).toBe(true);
    // Paddle 기록이 만료됐으면 Apple이 유효해도 지킬 Paddle 구독이 없다.
    const expiredPaddle = { ...paddle, premiumUntil: "2026-10-01T00:00:00.000Z" };
    const appleOnlyValid = doc({ sources: { paddle: expiredPaddle, apple: appleRecord }, source: "apple", premiumUntil: APPLE_UNTIL });
    expect(isForeignCancel(appleOnlyValid, event({ status: "canceled" }), NOW)).toBe(false);
  });
});

describe("applyTrial", () => {
  it("체험을 안 써봤고 비프리미엄이면 7일 체험을 부여한다", () => {
    const decision = applyTrial(doc(), NOW);
    expect(decision).toEqual({
      write: expect.objectContaining({
        plan: "premium",
        status: "trialing",
        source: "trial",
        premiumUntil: iso(NOW.getTime() + TRIAL_MS),
        trialUsedAt: NOW.toISOString(),
        cancelAt: null,
        updatedAt: NOW.toISOString(),
      }),
    });
  });

  it("이미 체험을 썼으면 거부한다(만료 후에도)", () => {
    expect(applyTrial(doc({ trialUsedAt: "2026-01-01T00:00:00.000Z" }), NOW)).toEqual({ skip: "TRIAL_ALREADY_USED" });
  });

  it("이미 프리미엄이면 거부한다", () => {
    expect(applyTrial(doc({ premiumUntil: "2026-10-11T00:00:00.000Z" }), NOW)).toEqual({ skip: "ALREADY_PREMIUM" });
  });

  it("체험 기록을 sources.trial에 남긴다", () => {
    const decision = applyTrial(doc(), NOW);
    expect("write" in decision && decision.write.sources.trial).toEqual({
      status: "trialing",
      premiumUntil: iso(NOW.getTime() + TRIAL_MS),
      cancelAt: null,
      currentPeriodEnd: null,
      autoRenew: false,
      startedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("만료된 Paddle 기록은 남기고 체험이 대표가 된다", () => {
    const expired = paddleDoc({ status: "canceled", premiumUntil: "2026-10-01T00:00:00.000Z" });
    const decision = applyTrial(expired, NOW);
    expect("write" in decision && decision.write).toMatchObject({
      source: "trial",
      customerId: "ctm_1",
      sources: { paddle: { status: "canceled" } },
    });
  });

  it("legacy paddle doc + trial request keeps paddle → ALREADY_PREMIUM", () => {
    expect(applyTrial(paddleDoc({ premiumUntil: "2026-11-13T00:00:00.000Z" }), NOW)).toEqual({ skip: "ALREADY_PREMIUM" });
  });

  it("trial rejected when any source premium — Apple만 유효해도 거부한다", () => {
    // 최상위가 아직 합쳐지지 않은 모양이어도 출처 기록으로 판정한다.
    const appleOnly: EntitlementDoc = { ...EMPTY_ENTITLEMENT, sources: { apple: appleRecord } };
    expect(applyTrial(appleOnly, NOW)).toEqual({ skip: "ALREADY_PREMIUM" });
  });

  it("trial rejected when trialUsedAt set by store trial — 앱 체험으로 쓴 계정도 거부한다", () => {
    const expiredApple = { ...appleRecord, premiumUntil: "2026-10-01T00:00:00.000Z" };
    const usedInApp = doc({ sources: { apple: expiredApple }, trialUsedAt: "2026-09-20T00:00:00.000Z" });
    expect(applyTrial(usedInApp, NOW)).toEqual({ skip: "TRIAL_ALREADY_USED" });
  });
});

describe("isPremiumAt / toClaimSeconds", () => {
  it("premiumUntil이 now보다 커야 프리미엄이다(같으면 아님)", () => {
    expect(isPremiumAt(doc({ premiumUntil: NOW.toISOString() }), NOW)).toBe(false);
    expect(isPremiumAt(doc({ premiumUntil: iso(NOW.getTime() + 1) }), NOW)).toBe(true);
    expect(isPremiumAt(doc({ premiumUntil: null }), NOW)).toBe(false);
  });

  it("클레임은 epoch 초(내림), null은 0", () => {
    expect(toClaimSeconds("2026-10-10T00:00:00.999Z")).toBe(Math.floor(Date.parse("2026-10-10T00:00:00.999Z") / 1000));
    expect(toClaimSeconds(null)).toBe(0);
  });
});

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
  ...overrides,
});

const doc = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc => ({
  ...EMPTY_ENTITLEMENT,
  ...overrides,
});

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
  });

  it("past_due면 기존 값과 기간 끝+3일 중 큰 값을 유지한다", () => {
    const later = "2026-12-31T00:00:00.000Z";
    expect(applySubscriptionEvent(doc({ premiumUntil: later }), event({ status: "past_due" }), NOW).premiumUntil).toBe(later);
    expect(applySubscriptionEvent(doc({ premiumUntil: null }), event({ status: "past_due" }), NOW).premiumUntil).toBe(
      iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
    );
    expect(applySubscriptionEvent(doc(), event({ status: "past_due" }), NOW).status).toBe("past_due");
  });

  it("canceled면 즉시 회수한다(premiumUntil = now, plan = free)", () => {
    const active = doc({ status: "active", premiumUntil: "2026-11-13T00:00:00.000Z", cancelAt: PERIOD_END });
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
    const next = applySubscriptionEvent(doc({ premiumUntil: "2026-10-20T00:00:00.000Z" }), event({ currentPeriodEndsAt: null }), NOW);
    expect(next.premiumUntil).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("isStaleEvent", () => {
  it("같은 event_id면 오래된 것으로 본다", () => {
    expect(isStaleEvent(doc({ lastWebhookEventId: "evt_1" }), event())).toBe(true);
  });

  it("occurred_at이 마지막 반영 시각 이하면 오래된 것으로 본다", () => {
    const existing = doc({ lastWebhookEventId: "evt_0", lastEventOccurredAt: "2026-10-10T00:00:01.000Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2" }))).toBe(true);
    expect(isStaleEvent(doc({ lastEventOccurredAt: "2026-10-10T00:00:00.000Z" }), event({ eventId: "evt_2" }))).toBe(true);
  });

  it("같은 밀리초 안의 이벤트도 마이크로초까지 비교한다(Paddle occurred_at은 µs 정밀도)", () => {
    const existing = doc({ lastWebhookEventId: "evt_1", lastEventOccurredAt: "2026-10-10T00:00:00.123456Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123457Z" }))).toBe(false);
    expect(isStaleEvent(existing, event({ eventId: "evt_0", occurredAt: "2026-10-10T00:00:00.123455Z" }))).toBe(true);
    expect(isStaleEvent(existing, event({ eventId: "evt_3", occurredAt: "2026-10-10T00:00:00.123456Z" }))).toBe(true);
  });

  it("정밀도가 서로 달라도 같은 순간이면 같게 본다", () => {
    const existing = doc({ lastWebhookEventId: "evt_1", lastEventOccurredAt: "2026-10-10T00:00:00.123Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123000Z" }))).toBe(true);
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:00.123001Z" }))).toBe(false);
    expect(isStaleEvent(existing, event({ eventId: "evt_2", occurredAt: "2026-10-10T00:00:01Z" }))).toBe(false);
  });

  it("처음 받는 이벤트는 오래되지 않았다", () => {
    expect(isStaleEvent(doc(), event())).toBe(false);
  });
});

describe("isForeignCancel", () => {
  const live = doc({ source: "paddle", status: "active", subscriptionId: "sub_old", premiumUntil: "2026-11-13T00:00:00.000Z" });

  it("살아 있는 다른 구독이 있는데 해지·일시정지 이벤트가 오면 true(이중 구독의 남은 쪽을 지킨다)", () => {
    expect(isForeignCancel(live, event({ status: "canceled" }), NOW)).toBe(true);
    expect(isForeignCancel(live, event({ status: "paused" }), NOW)).toBe(true);
  });

  it("같은 구독의 해지는 정상 반영한다", () => {
    expect(isForeignCancel(live, event({ status: "canceled", subscriptionId: "sub_old" }), NOW)).toBe(false);
  });

  it("해지·일시정지가 아닌 상태는 다른 구독이어도 반영한다", () => {
    expect(isForeignCancel(live, event({ status: "active" }), NOW)).toBe(false);
    expect(isForeignCancel(live, event({ status: "past_due" }), NOW)).toBe(false);
  });

  it("기존 문서가 이미 만료됐거나 Paddle 구독이 아니면 false", () => {
    expect(isForeignCancel({ ...live, premiumUntil: "2026-10-01T00:00:00.000Z" }, event({ status: "canceled" }), NOW)).toBe(false);
    expect(isForeignCancel({ ...live, source: "manual" }, event({ status: "canceled" }), NOW)).toBe(false);
    expect(isForeignCancel({ ...live, subscriptionId: null }, event({ status: "canceled" }), NOW)).toBe(false);
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

import { describe, it, expect } from "vitest";
import {
  aggregate,
  hasAutoRenewingStoreSubscription,
  isPremiumAt,
  toClaimSeconds,
} from "../aggregate";
import { EMPTY_ENTITLEMENT, type AppleRecord, type EntitlementDoc, type GoogleRecord, type PaddleRecord, type SourceRecord } from "../types";

const NOW = new Date("2026-12-01T00:00:00.000Z");
const FUTURE = "2027-01-01T00:00:00.000Z";
const FUTURE2 = "2027-02-01T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";

const rec = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  status: "active",
  premiumUntil: FUTURE,
  cancelAt: null,
  currentPeriodEnd: null,
  autoRenew: true,
  startedAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  ...over,
});
const paddle = (over: Partial<PaddleRecord> = {}): PaddleRecord => ({
  ...rec(),
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  lastWebhookEventId: "evt_1",
  lastEventOccurredAt: "2026-11-10T00:00:00.000Z",
  ...over,
});
const apple = (over: Partial<AppleRecord> = {}): AppleRecord => ({
  ...rec(),
  originalTransactionId: "otx_1",
  productId: "premium_monthly",
  environment: "Production",
  appAccountToken: null,
  lastNotificationUUID: null,
  lastSignedDate: null,
  ...over,
});
const google = (over: Partial<GoogleRecord> = {}): GoogleRecord => ({
  ...rec(),
  purchaseToken: "tok",
  productId: "premium_monthly",
  basePlanId: "monthly",
  environment: "Production",
  obfuscatedAccountId: null,
  lastMessageId: null,
  lastEventTime: null,
  ...over,
});
const doc = (sources: EntitlementDoc["sources"], over: Partial<EntitlementDoc> = {}): EntitlementDoc => ({
  ...EMPTY_ENTITLEMENT,
  sources,
  ...over,
});

describe("aggregate", () => {
  it("no sources → free, premiumUntil null, status none, source null", () => {
    const result = aggregate(doc({}, { plan: "premium", status: "active", source: "paddle", premiumUntil: FUTURE, cancelAt: FUTURE }), NOW);
    expect(result).toMatchObject({
      plan: "free",
      status: "none",
      source: null,
      premiumUntil: null,
      cancelAt: null,
      currentPeriodEnd: null,
      duplicate: null,
    });
  });

  it("picks max premiumUntil and its source's status/cancelAt/currentPeriodEnd", () => {
    const result = aggregate(
      doc({
        paddle: paddle({ premiumUntil: FUTURE, status: "active" }),
        apple: apple({ premiumUntil: FUTURE2, status: "past_due", cancelAt: FUTURE2, currentPeriodEnd: "2027-01-30T00:00:00.000Z" }),
      }),
      NOW,
    );
    expect(result).toMatchObject({
      plan: "premium",
      source: "apple",
      status: "past_due",
      premiumUntil: FUTURE2,
      cancelAt: FUTURE2,
      currentPeriodEnd: "2027-01-30T00:00:00.000Z",
    });
  });

  it("tie broken by paddle > apple > google > manual > trial", () => {
    const all = {
      trial: rec(),
      manual: rec(),
      google: google(),
      apple: apple(),
      paddle: paddle(),
    };
    expect(aggregate(doc(all), NOW).source).toBe("paddle");
    const { paddle: _p, ...noPaddle } = all;
    expect(aggregate(doc(noPaddle), NOW).source).toBe("apple");
    const { apple: _a, ...noApple } = noPaddle;
    expect(aggregate(doc(noApple), NOW).source).toBe("google");
    const { google: _g, ...noGoogle } = noApple;
    expect(aggregate(doc(noGoogle), NOW).source).toBe("manual");
  });

  it("customerId/subscriptionId/lastWebhookEventId/lastEventOccurredAt come from sources.paddle even when apple is representative", () => {
    const result = aggregate(doc({ paddle: paddle({ premiumUntil: FUTURE }), apple: apple({ premiumUntil: FUTURE2 }) }), NOW);
    expect(result.source).toBe("apple");
    expect(result).toMatchObject({
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      lastWebhookEventId: "evt_1",
      lastEventOccurredAt: "2026-11-10T00:00:00.000Z",
    });
  });

  it("clears paddle-derived fields when there is no paddle record", () => {
    const result = aggregate(doc({ apple: apple() }, { customerId: "stale", subscriptionId: "stale" }), NOW);
    expect(result.customerId).toBeNull();
    expect(result.subscriptionId).toBeNull();
  });

  it("expired sources still count for max (premiumUntil in past → plan free, source = that source)", () => {
    const result = aggregate(doc({ apple: apple({ premiumUntil: PAST, status: "canceled" }) }, { plan: "premium" }), NOW);
    expect(result).toMatchObject({ plan: "free", source: "apple", status: "canceled", premiumUntil: PAST });
  });

  it("ignores sources whose premiumUntil is null", () => {
    const result = aggregate(doc({ apple: apple({ premiumUntil: null }), manual: rec({ premiumUntil: FUTURE }) }), NOW);
    expect(result.source).toBe("manual");
  });

  describe("duplicate", () => {
    it("two auto-renewing valid payment sources → laterSource = later startedAt", () => {
      const result = aggregate(
        doc({
          paddle: paddle({ startedAt: "2026-11-01T00:00:00.000Z" }),
          apple: apple({ startedAt: "2026-11-20T00:00:00.000Z" }),
        }),
        NOW,
      );
      expect(result.duplicate).toEqual({ laterSource: "apple", detectedAt: NOW.toISOString() });
    });

    it("null startedAt counts as earliest", () => {
      const result = aggregate(
        doc({ paddle: paddle({ startedAt: null }), google: google({ startedAt: "2026-11-20T00:00:00.000Z" }) }),
        NOW,
      );
      expect(result.duplicate?.laterSource).toBe("google");
      const reversed = aggregate(
        doc({ paddle: paddle({ startedAt: "2026-11-20T00:00:00.000Z" }), google: google({ startedAt: null }) }),
        NOW,
      );
      expect(reversed.duplicate?.laterSource).toBe("paddle");
    });

    it("canceling (autoRenew false) source is not counted", () => {
      expect(aggregate(doc({ paddle: paddle({ autoRenew: false }), apple: apple() }), NOW).duplicate).toBeNull();
      expect(aggregate(doc({ paddle: paddle({ cancelAt: FUTURE }), apple: apple() }), NOW).duplicate).toBeNull();
    });

    it("expired or canceled-status source is not counted", () => {
      expect(aggregate(doc({ paddle: paddle({ premiumUntil: PAST }), apple: apple() }), NOW).duplicate).toBeNull();
      expect(aggregate(doc({ paddle: paddle({ status: "canceled" }), apple: apple() }), NOW).duplicate).toBeNull();
    });

    it("manual + apple is not duplicate", () => {
      expect(aggregate(doc({ manual: rec({ autoRenew: true }), apple: apple() }), NOW).duplicate).toBeNull();
    });

    it("keeps existing detectedAt when laterSource unchanged, sets now when new", () => {
      const sources = {
        paddle: paddle({ startedAt: "2026-11-01T00:00:00.000Z" }),
        apple: apple({ startedAt: "2026-11-20T00:00:00.000Z" }),
      };
      const kept = aggregate(doc(sources, { duplicate: { laterSource: "apple", detectedAt: "2026-11-25T00:00:00.000Z" } }), NOW);
      expect(kept.duplicate).toEqual({ laterSource: "apple", detectedAt: "2026-11-25T00:00:00.000Z" });
      const changed = aggregate(doc(sources, { duplicate: { laterSource: "paddle", detectedAt: "2026-11-25T00:00:00.000Z" } }), NOW);
      expect(changed.duplicate).toEqual({ laterSource: "apple", detectedAt: NOW.toISOString() });
    });
  });

  it("trialUsedAt and updatedAt untouched", () => {
    const result = aggregate(
      doc({ apple: apple() }, { trialUsedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-11-30T00:00:00.000Z" }),
      NOW,
    );
    expect(result.trialUsedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2026-11-30T00:00:00.000Z");
  });
});

describe("hasAutoRenewingStoreSubscription", () => {
  it("returns apple before google, null when none qualify", () => {
    expect(hasAutoRenewingStoreSubscription(doc({ apple: apple(), google: google() }), NOW)).toBe("apple");
    expect(hasAutoRenewingStoreSubscription(doc({ google: google() }), NOW)).toBe("google");
    expect(hasAutoRenewingStoreSubscription(doc({ apple: apple({ autoRenew: false }), google: google() }), NOW)).toBe("google");
    expect(hasAutoRenewingStoreSubscription(doc({ apple: apple({ cancelAt: FUTURE }) }), NOW)).toBeNull();
    expect(hasAutoRenewingStoreSubscription(doc({ apple: apple({ premiumUntil: PAST }) }), NOW)).toBeNull();
    expect(hasAutoRenewingStoreSubscription(doc({ paddle: paddle() }), NOW)).toBeNull();
  });
});

describe("isPremiumAt / toClaimSeconds", () => {
  it("premium only while premiumUntil is strictly after now", () => {
    expect(isPremiumAt({ premiumUntil: null }, NOW)).toBe(false);
    expect(isPremiumAt({ premiumUntil: NOW.toISOString() }, NOW)).toBe(false);
    expect(isPremiumAt({ premiumUntil: FUTURE }, NOW)).toBe(true);
  });
  it("claim seconds floors epoch seconds, null is 0", () => {
    expect(toClaimSeconds(null)).toBe(0);
    expect(toClaimSeconds("2026-12-01T00:00:00.999Z")).toBe(Date.parse("2026-12-01T00:00:00Z") / 1000);
  });
});

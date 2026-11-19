import { describe, it, expect } from "vitest";
import { EMPTY_ENTITLEMENT, RENEWAL_GRACE_MS, type EntitlementDoc } from "../entitlement";
import { applyGoogleSubscription, type GoogleEvent } from "../google/decide";
import type { PlaySubscription, PlaySubscriptionLineItem } from "../google/playApi";
import { hasAutoRenewingStoreSubscription } from "@tododo/core/dist/entitlement/index.js";
import { asStored } from "./helpers/storedDoc";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const DAY = 86_400_000;
const EXPIRY = NOW.getTime() + 20 * DAY;
const iso = (ms: number) => new Date(ms).toISOString();

const item = (o: Partial<PlaySubscriptionLineItem> = {}): PlaySubscriptionLineItem => ({
  productId: "premium_monthly",
  expiryTime: iso(EXPIRY),
  autoRenewEnabled: true,
  basePlanId: "monthly",
  offerId: null,
  inFreeTrial: false,
  ...o,
});
const sub = (o: Partial<PlaySubscription> = {}): PlaySubscription => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: iso(NOW.getTime() - 40 * DAY),
  linkedPurchaseToken: null,
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  testPurchase: false,
  obfuscatedAccountId: "acct",
  lineItems: [item()],
  ...o,
});
const state = (s: string, o: Partial<PlaySubscription> = {}) => sub({ subscriptionState: `SUBSCRIPTION_STATE_${s}`, ...o });
const ev = (o: Partial<GoogleEvent> = {}): GoogleEvent => ({ purchaseToken: "tok_1", messageId: "m1", eventTime: iso(NOW.getTime()), ...o });
const doc = (o: Partial<EntitlementDoc> = {}): EntitlementDoc => asStored({ ...EMPTY_ENTITLEMENT, ...o });

const written = (r: ReturnType<typeof applyGoogleSubscription>): EntitlementDoc => {
  if (!("write" in r)) throw new Error(`expected write, got skip ${r.skip}`);
  return r.write;
};
const google = (o = {}) => ({
  status: "active" as const,
  premiumUntil: iso(EXPIRY + RENEWAL_GRACE_MS),
  cancelAt: null,
  currentPeriodEnd: iso(EXPIRY),
  autoRenew: true,
  startedAt: iso(NOW.getTime() - 40 * DAY),
  updatedAt: iso(NOW.getTime() - DAY),
  purchaseToken: "tok_1",
  productId: "premium_monthly",
  basePlanId: "monthly",
  environment: "Production" as const,
  obfuscatedAccountId: "acct",
  lastMessageId: "m0",
  lastEventTime: iso(NOW.getTime() - DAY),
  ...o,
});

describe("applyGoogleSubscription", () => {
  it("ACTIVE autoRenew → active, expiry + 3d, record fields", () => {
    const g = written(applyGoogleSubscription(doc(), sub(), ev(), NOW)).sources.google;
    expect(g).toMatchObject({
      status: "active",
      premiumUntil: iso(EXPIRY + RENEWAL_GRACE_MS),
      cancelAt: null,
      currentPeriodEnd: iso(EXPIRY),
      autoRenew: true,
      startedAt: iso(NOW.getTime() - 40 * DAY),
      updatedAt: NOW.toISOString(),
      purchaseToken: "tok_1",
      productId: "premium_monthly",
      basePlanId: "monthly",
      environment: "Production",
      obfuscatedAccountId: "acct",
      lastMessageId: "m1",
      lastEventTime: iso(NOW.getTime()),
    });
  });

  it("ACTIVE inFreeTrial → trialing and sets trialUsedAt when null", () => {
    const out = written(applyGoogleSubscription(doc(), sub({ lineItems: [item({ inFreeTrial: true })] }), ev(), NOW));
    expect(out.sources.google?.status).toBe("trialing");
    expect(out.trialUsedAt).toBe(NOW.toISOString());
  });

  it("existing trialUsedAt is kept but record still applied", () => {
    const out = written(
      applyGoogleSubscription(doc({ trialUsedAt: "2026-01-01T00:00:00.000Z" }), sub({ lineItems: [item({ inFreeTrial: true })] }), ev(), NOW),
    );
    expect(out.trialUsedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(out.sources.google?.status).toBe("trialing");
  });

  it("lapsed trial (EXPIRED, inFreeTrial) still marks trialUsedAt", () => {
    const out = written(applyGoogleSubscription(doc(), state("EXPIRED", { lineItems: [item({ inFreeTrial: true })] }), ev(), NOW));
    expect(out.sources.google?.status).toBe("canceled");
    expect(out.trialUsedAt).toBe(NOW.toISOString());
  });

  it("CANCELED with future expiry → active, autoRenew false, cancelAt = premiumUntil = expiry", () => {
    const g = written(applyGoogleSubscription(doc(), state("CANCELED", { lineItems: [item({ autoRenewEnabled: false })] }), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ status: "active", autoRenew: false, cancelAt: iso(EXPIRY), premiumUntil: iso(EXPIRY) });
  });

  it("IN_GRACE_PERIOD → past_due, premiumUntil = max(existing, expiry + 3d)", () => {
    const later = iso(EXPIRY + 10 * DAY);
    const a = written(applyGoogleSubscription(doc({ sources: { google: google({ premiumUntil: later }) } }), state("IN_GRACE_PERIOD"), ev(), NOW));
    expect(a.sources.google).toMatchObject({ status: "past_due", premiumUntil: later });
    const b = written(applyGoogleSubscription(doc(), state("IN_GRACE_PERIOD"), ev(), NOW));
    expect(b.sources.google).toMatchObject({ status: "past_due", premiumUntil: iso(EXPIRY + RENEWAL_GRACE_MS) });
  });

  it("ON_HOLD → past_due, premiumUntil = now", () => {
    const g = written(applyGoogleSubscription(doc(), state("ON_HOLD"), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ status: "past_due", premiumUntil: NOW.toISOString() });
  });

  it("ON_HOLD·PAUSED는 스토어가 다시 청구하므로 autoRenew를 라인 아이템대로 두고 탈퇴 경고 대상이다", () => {
    for (const s of ["ON_HOLD", "PAUSED"]) {
      const out = written(applyGoogleSubscription(doc(), state(s), ev(), NOW));
      expect(out.sources.google).toMatchObject({ status: "past_due", premiumUntil: NOW.toISOString(), autoRenew: true, cancelAt: null });
      expect(out.plan).toBe("free");
      expect(hasAutoRenewingStoreSubscription(out, NOW)).toBe("google");
    }
    const off = written(applyGoogleSubscription(doc(), state("PAUSED", { lineItems: [item({ autoRenewEnabled: false })] }), ev(), NOW));
    expect(off.sources.google?.autoRenew).toBe(false);
  });

  it.each(["EXPIRED", "PENDING_PURCHASE_CANCELED"])("%s → canceled, now, autoRenew false", (s) => {
    const g = written(applyGoogleSubscription(doc(), state(s), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ status: "canceled", premiumUntil: NOW.toISOString(), autoRenew: false });
  });

  it("PENDING_PURCHASE_CANCELED with no line items → canceled", () => {
    const g = written(applyGoogleSubscription(doc(), state("PENDING_PURCHASE_CANCELED", { lineItems: [] }), ev(), NOW)).sources.google;
    expect(g?.status).toBe("canceled");
    expect(g?.currentPeriodEnd).toBeNull();
  });

  it("PENDING → skip PENDING even without line items", () => {
    expect(applyGoogleSubscription(doc(), state("PENDING", { lineItems: [] }), ev(), NOW)).toEqual({ skip: "PENDING" });
  });

  it("ACTIVE without line item or expiry, and unknown state → throw", () => {
    expect(() => applyGoogleSubscription(doc(), sub({ lineItems: [] }), ev(), NOW)).toThrow();
    expect(() => applyGoogleSubscription(doc(), sub({ lineItems: [item({ expiryTime: null })] }), ev(), NOW)).toThrow();
    expect(() => applyGoogleSubscription(doc(), state("WHATEVER"), ev(), NOW)).toThrow();
  });

  it("same messageId → DUPLICATE_MESSAGE", () => {
    const d = doc({ sources: { google: google({ lastMessageId: "m1" }) } });
    expect(applyGoogleSubscription(d, sub(), ev(), NOW)).toEqual({ skip: "DUPLICATE_MESSAGE" });
  });

  it("older or equal eventTime → STALE; null eventTime always applies", () => {
    const d = doc({ sources: { google: google({ lastEventTime: iso(NOW.getTime()) }) } });
    expect(applyGoogleSubscription(d, sub(), ev({ eventTime: iso(NOW.getTime() - 1000) }), NOW)).toEqual({ skip: "STALE" });
    expect(applyGoogleSubscription(d, sub(), ev({ eventTime: iso(NOW.getTime()) }), NOW)).toEqual({ skip: "STALE" });
    expect("write" in applyGoogleSubscription(d, sub(), ev({ eventTime: null, messageId: null }), NOW)).toBe(true);
  });

  it("linkedPurchaseToken equal to existing token → replaces record", () => {
    const d = doc({ sources: { google: google({ purchaseToken: "old" }) } });
    const out = written(applyGoogleSubscription(d, sub({ linkedPurchaseToken: "old" }), ev(), NOW));
    expect(out.sources.google?.purchaseToken).toBe("tok_1");
  });

  it("different token while existing valid and not linked → OTHER_SUBSCRIPTION", () => {
    const d = doc({ sources: { google: google({ purchaseToken: "old" }) } });
    expect(applyGoogleSubscription(d, sub(), ev(), NOW)).toEqual({ skip: "OTHER_SUBSCRIPTION" });
  });

  // 해지 예약된 기존 기록: 아직 유효하지만(5일 남음) 갱신되지 않는다.
  const scheduledUntil = iso(NOW.getTime() + 5 * DAY);
  const scheduledOld = (o = {}) =>
    google({ purchaseToken: "old", autoRenew: false, cancelAt: scheduledUntil, premiumUntil: scheduledUntil, currentPeriodEnd: scheduledUntil, ...o });

  it("new token replaces cancel-scheduled existing record", () => {
    // 해지 예약(자동 갱신 끔) 뒤 재구독한 새 토큰은 정당한 후속 구독이다 — linkedPurchaseToken이 없어도 교체한다.
    const out = written(applyGoogleSubscription(doc({ sources: { google: scheduledOld() } }), sub(), ev(), NOW));
    expect(out.sources.google?.purchaseToken).toBe("tok_1");
    expect(out.sources.google?.premiumUntil).toBe(iso(EXPIRY + RENEWAL_GRACE_MS));
    // cancelAt만 남은 기록(autoRenew 표시가 아직 true)도 같다.
    const cancelOnly = scheduledOld({ autoRenew: true });
    expect(written(applyGoogleSubscription(doc({ sources: { google: cancelOnly } }), sub(), ev(), NOW)).sources.google?.purchaseToken).toBe("tok_1");
    const notRenewing = scheduledOld({ cancelAt: null });
    expect(written(applyGoogleSubscription(doc({ sources: { google: notRenewing } }), sub(), ev(), NOW)).sources.google?.purchaseToken).toBe("tok_1");
  });

  it("cancel-scheduled valid record + incoming EXPIRED other token → OTHER_SUBSCRIPTION", () => {
    // 이미 끝난 옛 토큰의 알림·재검증이 해지 예약된 유효 구독의 남은 기간을 지우면 안 된다.
    const d = doc({ sources: { google: scheduledOld() } });
    const expired = state("EXPIRED", { lineItems: [item({ expiryTime: iso(NOW.getTime() - DAY), autoRenewEnabled: false })] });
    expect(applyGoogleSubscription(d, expired, ev(), NOW)).toEqual({ skip: "OTHER_SUBSCRIPTION" });
  });

  it("cancel-scheduled valid record + incoming voided/revoked (EXPIRED after refund) other token → OTHER_SUBSCRIPTION", () => {
    // 승인하지 않아 자동 환불된 이중 구독 토큰(ALREADY_SUBSCRIBED)도 환불 뒤에는 EXPIRED로 조회된다.
    const d = doc({ sources: { google: scheduledOld() } });
    const refunded = state("EXPIRED", { acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING", lineItems: [item({ autoRenewEnabled: false })] });
    expect(applyGoogleSubscription(d, refunded, ev(), NOW)).toEqual({ skip: "OTHER_SUBSCRIPTION" });
    expect(applyGoogleSubscription(d, state("PENDING_PURCHASE_CANCELED", { lineItems: [] }), ev(), NOW)).toEqual({ skip: "OTHER_SUBSCRIPTION" });
  });

  it("cancel-scheduled valid record + incoming active other token ending no later → OTHER_SUBSCRIPTION", () => {
    // 권한을 주더라도 기존 기록보다 일찍 끝나면 교체가 남은 유료 기간을 줄인다.
    const d = doc({ sources: { google: scheduledOld() } });
    const shorter = sub({ lineItems: [item({ expiryTime: iso(NOW.getTime() + DAY), autoRenewEnabled: false })] });
    expect(applyGoogleSubscription(d, shorter, ev(), NOW)).toEqual({ skip: "OTHER_SUBSCRIPTION" });
  });

  it("different token but existing record already canceled → replaces", () => {
    const d = doc({ sources: { google: google({ purchaseToken: "old", status: "canceled", premiumUntil: NOW.toISOString() }) } });
    expect(written(applyGoogleSubscription(d, sub(), ev(), NOW)).sources.google?.purchaseToken).toBe("tok_1");
  });

  it("testPurchase → Sandbox", () => {
    expect(written(applyGoogleSubscription(doc(), sub({ testPurchase: true }), ev(), NOW)).sources.google?.environment).toBe("Sandbox");
  });

  it("picks the line item matching the record productId, else the first", () => {
    const other = item({ productId: "other", expiryTime: iso(EXPIRY + 5 * DAY) });
    const out = written(applyGoogleSubscription(doc(), sub({ lineItems: [other, item()] }), ev(), NOW));
    expect(out.sources.google?.currentPeriodEnd).toBe(iso(EXPIRY));
    const fb = written(applyGoogleSubscription(doc(), sub({ lineItems: [other] }), ev(), NOW));
    expect(fb.sources.google?.currentPeriodEnd).toBe(iso(EXPIRY + 5 * DAY));
  });

  it("IN_GRACE_PERIOD keeps autoRenew from line item (true)", () => {
    const out = written(applyGoogleSubscription(doc(), state("IN_GRACE_PERIOD"), ev(), NOW));
    expect(out.sources.google).toMatchObject({ autoRenew: true, cancelAt: null });
    expect(hasAutoRenewingStoreSubscription(out, NOW)).toBe("google");
  });

  it("ON_HOLD keeps autoRenew from line item", () => {
    const g = written(applyGoogleSubscription(doc(), state("ON_HOLD"), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ autoRenew: true, cancelAt: null });
  });

  it("ACTIVE with autoRenewEnabled false → cancelAt = expiry, premiumUntil = expiry, autoRenew false", () => {
    const g = written(applyGoogleSubscription(doc(), sub({ lineItems: [item({ autoRenewEnabled: false })] }), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ autoRenew: false, cancelAt: iso(EXPIRY), premiumUntil: iso(EXPIRY) });
  });

  it("grace on linked replacement token keeps the longer existing premiumUntil", () => {
    const later = iso(EXPIRY + 10 * DAY);
    const d = doc({ sources: { google: google({ purchaseToken: "old", premiumUntil: later }) } });
    const g = written(applyGoogleSubscription(d, state("IN_GRACE_PERIOD", { linkedPurchaseToken: "old" }), ev(), NOW)).sources.google;
    expect(g).toMatchObject({ purchaseToken: "tok_1", premiumUntil: later });
  });

  it("aggregates into top-level fields", () => {
    const out = written(applyGoogleSubscription(doc(), sub(), ev(), NOW));
    expect(out.source).toBe("google");
    expect(out.premiumUntil).toBe(iso(EXPIRY + RENEWAL_GRACE_MS));
  });
});

import { describe, it, expect } from "vitest";
import { EMPTY_ENTITLEMENT, RENEWAL_GRACE_MS, type EntitlementDoc } from "../entitlement";
import { applyAppleSnapshot, type AppleSnapshot, type AppleTransaction } from "../apple/decide";
import { asStored } from "./helpers/storedDoc";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const DAY = 86_400_000;
const EXPIRES = NOW.getTime() + 20 * DAY;
const iso = (ms: number) => new Date(ms).toISOString();

const tx = (overrides: Partial<AppleTransaction> = {}): AppleTransaction => ({
  originalTransactionId: "otx_1",
  transactionId: "tx_1",
  bundleId: "com.swimmingriver.tododo",
  productId: "premium_monthly",
  purchaseDate: NOW.getTime() - 10 * DAY,
  originalPurchaseDate: NOW.getTime() - 40 * DAY,
  expiresDate: EXPIRES,
  environment: "Production",
  ...overrides,
});

const snap = (overrides: Partial<AppleSnapshot> = {}): AppleSnapshot => ({
  status: 1,
  transaction: tx(),
  renewal: { autoRenewStatus: 1 },
  notificationUUID: "uuid-1",
  signedDate: NOW.getTime(),
  ...overrides,
});

const doc = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc => asStored({ ...EMPTY_ENTITLEMENT, ...overrides });

const written = (result: ReturnType<typeof applyAppleSnapshot>): EntitlementDoc => {
  if (!("write" in result)) throw new Error(`expected write, got skip ${result.skip}`);
  return result.write;
};

const appleRecord = (overrides = {}) => ({
  status: "active" as const,
  premiumUntil: iso(EXPIRES + RENEWAL_GRACE_MS),
  cancelAt: null,
  currentPeriodEnd: iso(EXPIRES),
  autoRenew: true,
  startedAt: iso(NOW.getTime() - 40 * DAY),
  updatedAt: iso(NOW.getTime() - DAY),
  originalTransactionId: "otx_1",
  productId: "premium_monthly",
  environment: "Production" as const,
  appAccountToken: null,
  lastNotificationUUID: "uuid-0",
  lastSignedDate: iso(NOW.getTime() - DAY),
  ...overrides,
});

describe("applyAppleSnapshot", () => {
  it("status 1 autoRenew on → active, premiumUntil = expires + 3d", () => {
    const result = written(applyAppleSnapshot(doc(), snap(), NOW));
    expect(result.sources.apple).toMatchObject({
      status: "active",
      premiumUntil: iso(EXPIRES + RENEWAL_GRACE_MS),
      cancelAt: null,
      autoRenew: true,
      currentPeriodEnd: iso(EXPIRES),
    });
    expect(result.plan).toBe("premium");
    expect(result.source).toBe("apple");
  });

  it("introductory free trial → trialing and sets trialUsedAt if null", () => {
    const result = written(
      applyAppleSnapshot(doc(), snap({ transaction: tx({ offerType: 1, offerDiscountType: "FREE_TRIAL" }) }), NOW),
    );
    expect(result.sources.apple?.status).toBe("trialing");
    expect(result.sources.apple?.premiumUntil).toBe(iso(EXPIRES + RENEWAL_GRACE_MS));
    expect(result.trialUsedAt).toBe(NOW.toISOString());
  });

  it("trial purchase when trialUsedAt already set is still applied and keeps original trialUsedAt", () => {
    const used = "2026-01-01T00:00:00.000Z";
    const result = written(
      applyAppleSnapshot(
        doc({ trialUsedAt: used }),
        snap({ transaction: tx({ offerType: 1, offerDiscountType: "FREE_TRIAL" }) }),
        NOW,
      ),
    );
    expect(result.sources.apple?.status).toBe("trialing");
    expect(result.trialUsedAt).toBe(used);
  });

  it("non-trial purchase does not touch trialUsedAt", () => {
    expect(written(applyAppleSnapshot(doc(), snap(), NOW)).trialUsedAt).toBeNull();
  });

  it("autoRenew off → active, cancelAt = expires, premiumUntil = expires", () => {
    const result = written(applyAppleSnapshot(doc(), snap({ renewal: { autoRenewStatus: 0 } }), NOW));
    expect(result.sources.apple).toMatchObject({
      status: "active",
      premiumUntil: iso(EXPIRES),
      cancelAt: iso(EXPIRES),
      autoRenew: false,
    });
  });

  it("status 4 grace → past_due, premiumUntil = max(existing apple, gracePeriodExpires + 3d)", () => {
    const grace = NOW.getTime() + 5 * DAY;
    const result = written(
      applyAppleSnapshot(
        doc({ sources: { apple: appleRecord({ premiumUntil: iso(NOW.getTime() + DAY) }) } }),
        snap({ status: 4, renewal: { autoRenewStatus: 1, gracePeriodExpiresDate: grace } }),
        NOW,
      ),
    );
    expect(result.sources.apple?.status).toBe("past_due");
    expect(result.sources.apple?.premiumUntil).toBe(iso(grace + RENEWAL_GRACE_MS));
  });

  it("status 4 grace keeps a later existing premiumUntil", () => {
    const later = iso(NOW.getTime() + 30 * DAY);
    const result = written(
      applyAppleSnapshot(
        doc({ sources: { apple: appleRecord({ premiumUntil: later }) } }),
        snap({ status: 4, renewal: { autoRenewStatus: 1, gracePeriodExpiresDate: NOW.getTime() + DAY } }),
        NOW,
      ),
    );
    expect(result.sources.apple?.premiumUntil).toBe(later);
  });

  it("status 3 billing retry → past_due, premiumUntil = now", () => {
    const result = written(applyAppleSnapshot(doc(), snap({ status: 3 }), NOW));
    expect(result.sources.apple).toMatchObject({ status: "past_due", premiumUntil: NOW.toISOString() });
  });

  it.each([2, 5] as const)("status %i → canceled, premiumUntil = now", (status) => {
    const result = written(applyAppleSnapshot(doc(), snap({ status }), NOW));
    expect(result.sources.apple).toMatchObject({ status: "canceled", premiumUntil: NOW.toISOString(), cancelAt: null });
  });

  it("revocationDate set → canceled, premiumUntil = now (refund)", () => {
    const result = written(
      applyAppleSnapshot(doc(), snap({ transaction: tx({ revocationDate: NOW.getTime() - 1000 }) }), NOW),
    );
    expect(result.sources.apple).toMatchObject({ status: "canceled", premiumUntil: NOW.toISOString() });
  });

  it("refund on apple keeps paddle premium", () => {
    const paddleUntil = iso(NOW.getTime() + 15 * DAY);
    const existing = doc({
      sources: {
        paddle: {
          status: "active",
          premiumUntil: paddleUntil,
          cancelAt: null,
          currentPeriodEnd: paddleUntil,
          autoRenew: true,
          startedAt: null,
          updatedAt: NOW.toISOString(),
          customerId: "ctm_1",
          subscriptionId: "sub_1",
          lastWebhookEventId: "evt_1",
          lastEventOccurredAt: NOW.toISOString(),
        },
        apple: appleRecord(),
      },
    });
    const result = written(applyAppleSnapshot(existing, snap({ status: 5 }), NOW));
    expect(result.sources.apple?.status).toBe("canceled");
    expect(result.source).toBe("paddle");
    expect(result.premiumUntil).toBe(paddleUntil);
    expect(result.plan).toBe("premium");
  });

  it("same notificationUUID → skip DUPLICATE_NOTIFICATION", () => {
    const existing = doc({ sources: { apple: appleRecord({ lastNotificationUUID: "uuid-1" }) } });
    expect(applyAppleSnapshot(existing, snap({ notificationUUID: "uuid-1" }), NOW)).toEqual({
      skip: "DUPLICATE_NOTIFICATION",
    });
  });

  it("null notificationUUID is never a duplicate", () => {
    const existing = doc({ sources: { apple: appleRecord({ lastNotificationUUID: null, lastSignedDate: null }) } });
    expect("write" in applyAppleSnapshot(existing, snap({ notificationUUID: null, signedDate: null }), NOW)).toBe(true);
  });

  it("older or equal signedDate → skip STALE", () => {
    const existing = doc({ sources: { apple: appleRecord({ lastSignedDate: iso(NOW.getTime()) }) } });
    expect(applyAppleSnapshot(existing, snap({ signedDate: NOW.getTime() - 1 }), NOW)).toEqual({ skip: "STALE" });
    expect(applyAppleSnapshot(existing, snap({ signedDate: NOW.getTime() }), NOW)).toEqual({ skip: "STALE" });
  });

  it("newer signedDate is applied and stored as ISO with the notification uuid", () => {
    const existing = doc({ sources: { apple: appleRecord() } });
    const result = written(applyAppleSnapshot(existing, snap({ signedDate: NOW.getTime() }), NOW));
    expect(result.sources.apple?.lastSignedDate).toBe(NOW.toISOString());
    expect(result.sources.apple?.lastNotificationUUID).toBe("uuid-1");
  });

  it("different originalTransactionId while existing apple record valid → skip OTHER_SUBSCRIPTION", () => {
    const existing = doc({ sources: { apple: appleRecord() } });
    expect(
      applyAppleSnapshot(existing, snap({ transaction: tx({ originalTransactionId: "otx_2" }) }), NOW),
    ).toEqual({ skip: "OTHER_SUBSCRIPTION" });
  });

  it("different originalTransactionId replaces an expired or canceled apple record", () => {
    const expired = doc({ sources: { apple: appleRecord({ premiumUntil: iso(NOW.getTime() - DAY) }) } });
    const canceled = doc({ sources: { apple: appleRecord({ status: "canceled" }) } });
    for (const existing of [expired, canceled]) {
      const result = written(applyAppleSnapshot(existing, snap({ transaction: tx({ originalTransactionId: "otx_2" }) }), NOW));
      expect(result.sources.apple?.originalTransactionId).toBe("otx_2");
    }
  });

  it("records environment, productId, appAccountToken, startedAt = originalPurchaseDate", () => {
    const t = tx({ environment: "Sandbox", productId: "premium_monthly_trial", appAccountToken: "token-1" });
    const result = written(applyAppleSnapshot(doc(), snap({ transaction: t }), NOW));
    expect(result.sources.apple).toMatchObject({
      environment: "Sandbox",
      productId: "premium_monthly_trial",
      appAccountToken: "token-1",
      startedAt: iso(t.originalPurchaseDate),
      originalTransactionId: "otx_1",
      updatedAt: NOW.toISOString(),
    });
    expect(result.updatedAt).toBe(NOW.toISOString());
  });

  it("appAccountToken defaults to null", () => {
    expect(written(applyAppleSnapshot(doc(), snap(), NOW)).sources.apple?.appAccountToken).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { applyManual } from "../manual";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../types";

const NOW = new Date("2026-12-01T00:00:00.000Z");
const UNTIL = "2027-03-01T00:00:00.000Z";

describe("applyManual", () => {
  it("applyManual(until) sets sources.manual active with premiumUntil=until and aggregates", () => {
    const result = applyManual(EMPTY_ENTITLEMENT, UNTIL, NOW);
    expect(result.sources.manual).toMatchObject({
      status: "active",
      premiumUntil: UNTIL,
      autoRenew: false,
      cancelAt: null,
      updatedAt: NOW.toISOString(),
    });
    expect(result).toMatchObject({ plan: "premium", status: "active", source: "manual", premiumUntil: UNTIL, updatedAt: NOW.toISOString() });
  });

  it("applyManual(null) removes sources.manual only; paddle-premium doc stays premium", () => {
    const paddlePremium = "2027-01-01T00:00:00.000Z";
    const base: EntitlementDoc = {
      ...EMPTY_ENTITLEMENT,
      sources: {
        paddle: {
          status: "active",
          premiumUntil: paddlePremium,
          cancelAt: null,
          currentPeriodEnd: null,
          autoRenew: true,
          startedAt: null,
          updatedAt: "2026-11-01T00:00:00.000Z",
          customerId: "ctm_1",
          subscriptionId: "sub_1",
          lastWebhookEventId: null,
          lastEventOccurredAt: null,
        },
        manual: {
          status: "active",
          premiumUntil: UNTIL,
          cancelAt: null,
          currentPeriodEnd: null,
          autoRenew: false,
          startedAt: null,
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      },
    };
    const result = applyManual(base, null, NOW);
    expect(Object.keys(result.sources)).toEqual(["paddle"]);
    expect(result).toMatchObject({ plan: "premium", source: "paddle", premiumUntil: paddlePremium });
  });

  it("applyManual(null) on a manual-only doc makes it free", () => {
    const granted = applyManual(EMPTY_ENTITLEMENT, UNTIL, NOW);
    const revoked = applyManual(granted, null, NOW);
    expect(revoked).toMatchObject({ plan: "free", source: null, premiumUntil: null, status: "none" });
  });

  it("does not mutate the input", () => {
    const input = { ...EMPTY_ENTITLEMENT, sources: {} };
    applyManual(input, UNTIL, NOW);
    expect(input.sources).toEqual({});
  });
});

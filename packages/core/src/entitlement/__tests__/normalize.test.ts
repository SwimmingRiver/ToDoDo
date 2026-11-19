import { describe, it, expect } from "vitest";
import { normalizeEntitlement } from "../normalize";
import { EMPTY_ENTITLEMENT } from "../types";

const P = "2026-12-31T00:00:00.000Z";
const T = "2026-11-01T00:00:00.000Z";

describe("normalizeEntitlement", () => {
  it("returns EMPTY for undefined/null/non-object", () => {
    for (const input of [undefined, null, 3, "x", [], true]) {
      expect(normalizeEntitlement(input)).toEqual(EMPTY_ENTITLEMENT);
    }
  });

  it("does not share the sources object with EMPTY_ENTITLEMENT", () => {
    const doc = normalizeEntitlement(null);
    expect(doc.sources).not.toBe(EMPTY_ENTITLEMENT.sources);
  });

  it("fills missing top-level fields with defaults", () => {
    const doc = normalizeEntitlement({ plan: "premium", premiumUntil: P });
    expect(doc).toEqual({ ...EMPTY_ENTITLEMENT, plan: "premium", premiumUntil: P });
  });

  it("migrates legacy paddle doc", () => {
    const doc = normalizeEntitlement({
      plan: "premium",
      source: "paddle",
      status: "active",
      premiumUntil: P,
      cancelAt: null,
      currentPeriodEnd: T,
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      lastWebhookEventId: "evt_1",
      lastEventOccurredAt: T,
      updatedAt: T,
    });
    expect(doc.sources).toEqual({
      paddle: {
        status: "active",
        premiumUntil: P,
        cancelAt: null,
        currentPeriodEnd: T,
        autoRenew: true,
        startedAt: null,
        updatedAt: T,
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        lastWebhookEventId: "evt_1",
        lastEventOccurredAt: T,
      },
    });
    expect(doc.customerId).toBe("ctm_1");
  });

  it("legacy paddle doc with cancelAt has autoRenew false", () => {
    const doc = normalizeEntitlement({
      source: "paddle",
      status: "active",
      premiumUntil: P,
      cancelAt: P,
      customerId: "ctm_1",
      subscriptionId: "sub_1",
    });
    expect(doc.sources.paddle?.autoRenew).toBe(false);
    expect(doc.sources.paddle?.cancelAt).toBe(P);
  });

  it("migrates legacy trial and manual docs", () => {
    const trial = normalizeEntitlement({ source: "trial", status: "trialing", premiumUntil: P, updatedAt: T });
    expect(trial.sources.trial).toMatchObject({ status: "trialing", premiumUntil: P, autoRenew: false, startedAt: null });
    expect(Object.keys(trial.sources)).toEqual(["trial"]);

    const manual = normalizeEntitlement({ source: "manual", status: "active", premiumUntil: P });
    expect(manual.sources.manual).toMatchObject({ status: "active", premiumUntil: P, autoRenew: false });
    expect(Object.keys(manual.sources)).toEqual(["manual"]);
  });

  it("Paddle id가 남은 예전 manual·trial 문서는 Paddle 기록도 권한 없이 함께 이주한다", () => {
    // 예전 부여 스크립트·체험이 Paddle 구독자 문서 위에 source만 바꿔 덮었다. Paddle 기록을 만들지 않으면
    // 첫 쓰기에서 customerId·subscriptionId가 영영 사라진다(포털·같은 고객 결제·낡은 이벤트 차단이 꺼짐).
    for (const source of ["manual", "trial"] as const) {
      const doc = normalizeEntitlement({
        source,
        status: "active",
        premiumUntil: P,
        currentPeriodEnd: "2026-11-20T00:00:00.000Z",
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        lastWebhookEventId: "evt_9",
        lastEventOccurredAt: T,
        updatedAt: T,
      });
      expect(doc.sources[source]).toMatchObject({ status: "active", premiumUntil: P });
      expect(doc.sources.paddle).toEqual({
        status: "canceled",
        premiumUntil: null,
        cancelAt: null,
        currentPeriodEnd: "2026-11-20T00:00:00.000Z",
        autoRenew: false,
        startedAt: null,
        updatedAt: T,
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        lastWebhookEventId: "evt_9",
        lastEventOccurredAt: T,
      });
    }
    const nullSource = normalizeEntitlement({ source: null, customerId: "ctm_1", subscriptionId: "sub_1" });
    expect(Object.keys(nullSource.sources)).toEqual(["paddle"]);
    // id 하나만 있으면 Paddle 기록을 만들지 않는다.
    expect(normalizeEntitlement({ source: "manual", premiumUntil: P, customerId: "ctm_1" }).sources.paddle).toBeUndefined();
  });

  it("legacy doc with source null has empty sources", () => {
    expect(normalizeEntitlement({ plan: "free", source: null }).sources).toEqual({});
  });

  it("keeps existing sources and does not re-migrate top-level", () => {
    const doc = normalizeEntitlement({
      source: "manual",
      premiumUntil: P,
      sources: { trial: { status: "trialing", premiumUntil: P, updatedAt: T } },
    });
    expect(Object.keys(doc.sources)).toEqual(["trial"]);
  });

  it("drops unknown source keys and records missing required ids", () => {
    const doc = normalizeEntitlement({
      sources: {
        foo: { status: "active", premiumUntil: P },
        apple: { status: "active", premiumUntil: P, productId: "premium_monthly" },
        google: { status: "active", premiumUntil: P, purchaseToken: "tok" },
        paddle: { status: "active", premiumUntil: P, customerId: "ctm_1" },
        manual: { status: "active", premiumUntil: P },
      },
    });
    expect(Object.keys(doc.sources)).toEqual(["manual"]);
  });

  it("normalizes store records and defaults bad environment to Production", () => {
    const doc = normalizeEntitlement({
      sources: {
        apple: { status: "active", premiumUntil: P, originalTransactionId: "1", productId: "premium_monthly", environment: "weird" },
        google: { status: "active", premiumUntil: P, purchaseToken: "tok", productId: "premium_monthly", environment: "Sandbox" },
      },
    });
    expect(doc.sources.apple).toMatchObject({ environment: "Production", appAccountToken: null, autoRenew: false });
    expect(doc.sources.google).toMatchObject({ environment: "Sandbox", basePlanId: null });
  });

  it("rejects invalid enum values", () => {
    const doc = normalizeEntitlement({ status: "weird", source: "x", plan: "gold" });
    expect(doc.status).toBe("none");
    expect(doc.source).toBeNull();
    expect(doc.plan).toBe("free");
  });

  it("rejects malformed duplicate", () => {
    expect(normalizeEntitlement({ duplicate: { laterSource: "manual", detectedAt: T } }).duplicate).toBeNull();
    expect(normalizeEntitlement({ duplicate: { laterSource: "apple", detectedAt: T } }).duplicate).toEqual({
      laterSource: "apple",
      detectedAt: T,
    });
  });
});

import { describe, it, expect } from "@jest/globals";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";
import { duplicateNotice, getMobilePremiumView } from "../premiumView";

const NOW = Date.parse("2026-11-19T00:00:00Z");
const FUTURE = "2026-12-19T00:00:00.000Z";
const doc = (over: Partial<EntitlementDoc>): EntitlementDoc => ({ ...EMPTY_ENTITLEMENT, ...over });
const storeDoc = (source: "apple" | "google", over: Partial<EntitlementDoc> = {}) =>
  doc({ plan: "premium", status: "active", source, premiumUntil: FUTURE, ...over });

describe("getMobilePremiumView", () => {
  it("offer withTrial only when trialUsedAt null AND store eligible", () => {
    expect(getMobilePremiumView(EMPTY_ENTITLEMENT, NOW, true)).toEqual({ kind: "offer", withTrial: true });
    expect(getMobilePremiumView(EMPTY_ENTITLEMENT, NOW, false)).toEqual({ kind: "offer", withTrial: false });
    expect(getMobilePremiumView(doc({ trialUsedAt: "2026-01-01T00:00:00.000Z" }), NOW, true)).toEqual({ kind: "offer", withTrial: false });
  });
  it("undefined doc → offer", () => {
    expect(getMobilePremiumView(undefined, NOW, true)).toEqual({ kind: "offer", withTrial: true });
  });
  it("expired premium → offer", () => {
    expect(getMobilePremiumView(doc({ status: "canceled", source: "apple", premiumUntil: "2026-01-01T00:00:00.000Z" }), NOW, false).kind).toBe("offer");
  });
  it("paddle → external, manual → granted", () => {
    expect(getMobilePremiumView(storeDoc("apple", { source: "paddle" }), NOW, false)).toEqual({ kind: "external", until: FUTURE });
    expect(getMobilePremiumView(storeDoc("apple", { source: "manual" }), NOW, false)).toEqual({ kind: "granted", until: FUTURE });
  });
  it("trial source → trialing", () => {
    expect(getMobilePremiumView(storeDoc("apple", { source: "trial", status: "trialing" }), NOW, false)).toEqual({ kind: "trialing", until: FUTURE });
  });
  it("store source → store with canceling flag", () => {
    expect(getMobilePremiumView(storeDoc("google"), NOW, false)).toEqual({ kind: "store", store: "google", until: FUTURE, canceling: false });
    expect(getMobilePremiumView(storeDoc("apple", { cancelAt: FUTURE }), NOW, false)).toEqual({ kind: "store", store: "apple", until: FUTURE, canceling: true });
  });
  it("past_due → pastDue with store", () => {
    expect(getMobilePremiumView(storeDoc("apple", { status: "past_due" }), NOW, false)).toEqual({ kind: "pastDue", store: "apple" });
    expect(getMobilePremiumView(storeDoc("apple", { status: "past_due", source: "paddle" }), NOW, false)).toEqual({ kind: "pastDue", store: null });
  });
});

describe("duplicateNotice", () => {
  const dup = (laterSource: "apple" | "google" | "paddle") => doc({ duplicate: { laterSource, detectedAt: "2026-11-19T00:00:00.000Z" } });
  it("later apple on ios", () => {
    expect(duplicateNotice(dup("apple"), "ios")).toBe("구독이 두 군데서 결제되고 있어요. 나중에 시작한 App Store 구독을 해지해 주세요");
  });
  it("later google on android", () => {
    expect(duplicateNotice(dup("google"), "android")).toBe("구독이 두 군데서 결제되고 있어요. 나중에 시작한 Google Play 구독을 해지해 주세요");
  });
  it("later paddle → null; other platform's store → null; none → null", () => {
    expect(duplicateNotice(dup("paddle"), "ios")).toBeNull();
    expect(duplicateNotice(dup("google"), "ios")).toBeNull();
    expect(duplicateNotice(EMPTY_ENTITLEMENT, "ios")).toBeNull();
  });
});

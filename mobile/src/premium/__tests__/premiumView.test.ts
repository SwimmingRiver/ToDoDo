import { describe, it, expect } from "@jest/globals";
import { EMPTY_ENTITLEMENT, type EntitlementDoc, type SourceRecord } from "@tododo/core/dist/entitlement/index.js";
import { duplicateNotice, getMobilePremiumView } from "../premiumView";

const NOW = Date.parse("2026-11-19T00:00:00Z");
const FUTURE = "2026-12-19T00:00:00.000Z";
const PERIOD_END = "2026-12-16T00:00:00.000Z"; // FUTURE - 유예 3일
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
    expect(getMobilePremiumView(storeDoc("google", { currentPeriodEnd: PERIOD_END }), NOW, false)).toEqual({ kind: "store", store: "google", until: PERIOD_END, canceling: false });
    expect(getMobilePremiumView(storeDoc("apple", { cancelAt: FUTURE }), NOW, false)).toEqual({ kind: "store", store: "apple", until: FUTURE, canceling: true });
  });
  // 자동 갱신 중인 스토어 구독의 premiumUntil은 기간 끝 + 유예 3일이다. 다음 결제일로 보이면 3일 늦다.
  it("renewing store → until is the record's currentPeriodEnd, not premiumUntil (+grace)", () => {
    const record: SourceRecord = {
      status: "active",
      premiumUntil: FUTURE,
      cancelAt: null,
      currentPeriodEnd: PERIOD_END,
      autoRenew: true,
      startedAt: null,
      updatedAt: "",
    };
    const d = storeDoc("apple", { currentPeriodEnd: null, sources: { apple: { ...record, originalTransactionId: "o", productId: "p", environment: "Production", appAccountToken: null, lastNotificationUUID: null, lastSignedDate: null } } });
    expect(getMobilePremiumView(d, NOW, false)).toEqual({ kind: "store", store: "apple", until: PERIOD_END, canceling: false });
    expect(getMobilePremiumView(storeDoc("google", { currentPeriodEnd: null }), NOW, false)).toEqual({ kind: "store", store: "google", until: null, canceling: false });
  });
  it("canceling store → until is cancelAt (expiry, no grace)", () => {
    const d = storeDoc("google", { premiumUntil: FUTURE, cancelAt: PERIOD_END, currentPeriodEnd: PERIOD_END });
    expect(getMobilePremiumView(d, NOW, false)).toEqual({ kind: "store", store: "google", until: PERIOD_END, canceling: true });
  });
  it("past_due → pastDue with store", () => {
    expect(getMobilePremiumView(storeDoc("apple", { status: "past_due" }), NOW, false)).toEqual({ kind: "pastDue", store: "apple" });
    expect(getMobilePremiumView(storeDoc("apple", { status: "past_due", source: "paddle" }), NOW, false)).toEqual({ kind: "pastDue", store: null });
  });
});

describe("getMobilePremiumView — 스토어 결제 재시도·보류(유효 기간 없음)", () => {
  // Apple status 3·Google ON_HOLD: premiumUntil=지금이라 프리미엄이 아니지만 스토어는 계속 청구를 시도한다.
  const retryRecord = (over: Partial<SourceRecord> = {}): SourceRecord => ({
    status: "past_due",
    premiumUntil: new Date(NOW).toISOString(),
    cancelAt: null,
    currentPeriodEnd: new Date(NOW).toISOString(),
    autoRenew: true,
    startedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
    ...over,
  });
  const retryDoc = (key: "apple" | "google", over: Partial<SourceRecord> = {}) =>
    doc({
      status: "past_due",
      source: key,
      premiumUntil: new Date(NOW).toISOString(),
      sources: { [key]: retryRecord(over) } as EntitlementDoc["sources"],
    });
  it("자동 갱신 중인 스토어 past_due → 구매 권유가 아니라 pastDue(그 스토어)", () => {
    expect(getMobilePremiumView(retryDoc("apple"), NOW, true)).toEqual({ kind: "pastDue", store: "apple" });
    expect(getMobilePremiumView(retryDoc("google"), NOW, true)).toEqual({ kind: "pastDue", store: "google" });
  });
  it("자동 갱신이 꺼졌으면 offer", () => {
    expect(getMobilePremiumView(retryDoc("apple", { autoRenew: false }), NOW, false).kind).toBe("offer");
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

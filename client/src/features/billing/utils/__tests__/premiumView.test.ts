import { describe, it, expect } from "vitest";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";
import { formatMonthDay, getPremiumView } from "../premiumView";

const NOW = Date.parse("2026-10-10T00:00:00.000Z");
const e = (overrides: Partial<Entitlement>): Entitlement => ({ ...DEFAULT_ENTITLEMENT, ...overrides });

const record = {
  status: "active" as const,
  premiumUntil: "2026-11-13T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: "2026-11-10T00:00:00.000Z",
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const paddleRecord = { ...record, customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: null, lastEventOccurredAt: null };

describe("getPremiumView", () => {
  it("대표 출처 apple이고 프리미엄 → store 보기(결제·포털 없음)", () => {
    const view = getPremiumView(e({ status: "active", source: "apple", premiumUntil: "2026-11-13T00:00:00.000Z" }), NOW);
    expect(view).toEqual({ kind: "store", store: "apple", until: new Date("2026-11-13T00:00:00.000Z"), canceling: false, pastDue: false });
  });

  it("google 해지 예약 → store 보기 canceling", () => {
    const view = getPremiumView(
      e({ status: "active", source: "google", premiumUntil: "2026-11-13T00:00:00.000Z", cancelAt: "2026-11-13T00:00:00.000Z" }),
      NOW,
    );
    expect(view).toMatchObject({ kind: "store", store: "google", canceling: true, pastDue: false });
  });

  it("apple past_due → paddle pastDue가 아니라 store 보기(pastDue true)", () => {
    const view = getPremiumView(e({ status: "past_due", source: "apple", premiumUntil: "2026-10-12T00:00:00.000Z" }), NOW);
    expect(view).toMatchObject({ kind: "store", store: "apple", pastDue: true });
  });

  it("구독 중 canManage는 sources.paddle.customerId 기준(최상위 customerId만으론 아님)", () => {
    const base = { status: "active" as const, source: "paddle" as const, premiumUntil: "2026-11-13T00:00:00.000Z" };
    expect(getPremiumView(e({ ...base, customerId: "ctm_1" }), NOW)).toMatchObject({ kind: "active", canManage: false });
    expect(getPremiumView(e({ ...base, sources: { paddle: paddleRecord } }), NOW)).toMatchObject({ kind: "active", canManage: true });
  });

  it("비프리미엄, 체험 미사용 → offer(canTrial)", () => {
    expect(getPremiumView(DEFAULT_ENTITLEMENT, NOW)).toEqual({ kind: "offer", canTrial: true });
  });

  it("체험 만료 → offer(체험 불가)", () => {
    expect(getPremiumView(e({ status: "trialing", trialUsedAt: "2026-10-01T00:00:00.000Z", premiumUntil: "2026-10-08T00:00:00.000Z" }), NOW)).toEqual({
      kind: "offer",
      canTrial: false,
    });
  });

  it("체험 중 → 남은 일수(올림)", () => {
    const view = getPremiumView(e({ status: "trialing", trialUsedAt: "2026-10-09T12:00:00.000Z", premiumUntil: "2026-10-16T12:00:00.000Z" }), NOW);
    expect(view).toEqual({ kind: "trialing", until: new Date("2026-10-16T12:00:00.000Z"), daysLeft: 7 });
  });

  it("구독 중 → 다음 결제일, 고객이 있으면 관리 가능", () => {
    const view = getPremiumView(
      e({ status: "active", source: "paddle", premiumUntil: "2026-11-13T00:00:00.000Z", currentPeriodEnd: "2026-11-10T00:00:00.000Z", sources: { paddle: paddleRecord } }),
      NOW,
    );
    expect(view).toEqual({ kind: "active", nextBillingAt: new Date("2026-11-10T00:00:00.000Z"), canManage: true });
  });

  it("운영자 부여(manual) → active, 결제일·관리 없음", () => {
    expect(getPremiumView(e({ status: "active", source: "manual", premiumUntil: "2099-12-31T00:00:00.000Z" }), NOW)).toEqual({
      kind: "active",
      nextBillingAt: null,
      canManage: false,
    });
  });

  it("해지 예약 → canceling", () => {
    expect(getPremiumView(e({ status: "active", premiumUntil: "2026-11-10T00:00:00.000Z", cancelAt: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" }), NOW)).toEqual({
      kind: "canceling",
      until: new Date("2026-11-10T00:00:00.000Z"),
    });
  });

  it("past_due는 만료 여부와 무관하게 pastDue", () => {
    expect(getPremiumView(e({ status: "past_due", premiumUntil: "2026-10-01T00:00:00.000Z" }), NOW)).toEqual({ kind: "pastDue" });
  });

  it("해지 완료 → offer", () => {
    expect(getPremiumView(e({ status: "canceled", premiumUntil: "2026-10-09T00:00:00.000Z", trialUsedAt: null }), NOW)).toEqual({
      kind: "offer",
      canTrial: true,
    });
  });
});

describe("formatMonthDay", () => {
  it("로컬 날짜로 표시한다(자정 근처 UTC 값이 로컬 기준으로 바뀌어야 한다)", () => {
    const date = new Date("2026-11-03T15:30:00.000Z");
    expect(formatMonthDay(date)).toBe(`${date.getMonth() + 1}월 ${date.getDate()}일`);
  });
});

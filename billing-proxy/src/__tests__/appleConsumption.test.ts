import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildConsumptionBody, decideRefundPreference, REFUND_WINDOW_MS } from "../apple/consumption";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("decideRefundPreference", () => {
  // 실제 시계와 무관하게 고정한다 — 기준 시각은 mock된 시스템 시간에서만 읽는다.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("14일 창은 정확히 14일이다", () => {
    expect(REFUND_WINDOW_MS).toBe(14 * DAY);
  });

  it("13d23h → grant", () => {
    const now = Date.now();
    expect(decideRefundPreference(now - (13 * DAY + 23 * HOUR), now)).toBe("grant");
  });

  it("exactly 14d → grant", () => {
    const now = Date.now();
    expect(decideRefundPreference(now - 14 * DAY, now)).toBe("grant");
  });

  it("14d+1ms → decline", () => {
    const now = Date.now();
    expect(decideRefundPreference(now - 14 * DAY - 1, now)).toBe("decline");
  });

  it("구매일이 지금보다 뒤(시계 오차)여도 grant", () => {
    const now = Date.now();
    expect(decideRefundPreference(now + HOUR, now)).toBe("grant");
  });
});

describe("buildConsumptionBody", () => {
  it("grant → GRANT_FULL, 동의·전달·미리보기 필수 필드 포함", () => {
    expect(buildConsumptionBody("grant")).toEqual({
      customerConsented: true,
      deliveryStatus: "DELIVERED",
      sampleContentProvided: true,
      refundPreference: "GRANT_FULL",
    });
  });

  it("decline → DECLINE", () => {
    expect(buildConsumptionBody("decline")).toMatchObject({ refundPreference: "DECLINE" });
  });

  it("자동 갱신 구독이라 consumptionPercentage는 보내지 않는다", () => {
    expect(buildConsumptionBody("grant")).not.toHaveProperty("consumptionPercentage");
  });
});

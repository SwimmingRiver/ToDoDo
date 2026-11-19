import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// 실제 expo-iap(네이티브 모듈)는 불러오지 않는다. 취소 판정은 라이브러리와 같은 규칙(code === "user-cancelled")으로 흉내 낸다.
const mockRequestPurchase = jest.fn<(args: unknown) => Promise<unknown>>();
jest.mock("expo-iap", () => ({
  initConnection: jest.fn(async () => true),
  requestPurchase: (args: unknown) => mockRequestPurchase(args),
  isUserCancelledError: (error: unknown) =>
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "user-cancelled",
}));

import { purchaseClient } from "../purchaseClient";

const TOKEN = "11111111-2222-4333-8444-555555555555";

describe("purchaseClient.buy (iOS)", () => {
  beforeEach(() => {
    mockRequestPurchase.mockReset();
  });

  it("체험이면 premium_monthly_trial을 appAccountToken과 함께 요청한다", async () => {
    mockRequestPurchase.mockResolvedValue(null);
    await purchaseClient.buy({ withTrial: true, accountToken: TOKEN });
    expect(mockRequestPurchase).toHaveBeenCalledWith({
      type: "subs",
      request: { apple: { sku: "premium_monthly_trial", appAccountToken: TOKEN } },
    });
  });

  it("사용자 취소로 거절되면 정상 종료한다", async () => {
    mockRequestPurchase.mockRejectedValue({ code: "user-cancelled", message: "cancelled" });
    await expect(purchaseClient.buy({ withTrial: false, accountToken: TOKEN })).resolves.toBeUndefined();
  });

  it("취소가 아닌 오류는 그대로 던진다", async () => {
    mockRequestPurchase.mockRejectedValue({ code: "network-error", message: "offline" });
    await expect(purchaseClient.buy({ withTrial: false, accountToken: TOKEN })).rejects.toEqual({
      code: "network-error",
      message: "offline",
    });
  });
});

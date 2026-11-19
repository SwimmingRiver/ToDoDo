import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { PurchaseClient, StorePurchase } from "../purchaseClient";
import type { VerifyResult } from "../verifyApi";

const mockClient = {
  buy: jest.fn<PurchaseClient["buy"]>(),
  listUnfinished: jest.fn<PurchaseClient["listUnfinished"]>(),
  listAvailable: jest.fn<PurchaseClient["listAvailable"]>(),
  finish: jest.fn<PurchaseClient["finish"]>(),
  isTrialEligible: jest.fn<PurchaseClient["isTrialEligible"]>(),
  openManageSubscriptions: jest.fn<PurchaseClient["openManageSubscriptions"]>(),
  onPurchase: jest.fn<PurchaseClient["onPurchase"]>(),
};
// import가 먼저 평가되므로 getter로 늦게 읽는다.
jest.mock("../purchaseClient", () => ({ get purchaseClient() { return mockClient; } }));

const mockVerify = jest.fn<(p: StorePurchase) => Promise<VerifyResult>>();
jest.mock("../verifyApi", () => ({ verifyPurchase: (p: StorePurchase) => mockVerify(p) }));

const mockRefreshClaims = jest.fn<() => Promise<void>>();
jest.mock("../../useEntitlementSync", () => ({ refreshClaims: () => mockRefreshClaims() }));

import { resumePendingPurchases } from "../resumePending";

const purchase = (proof: string): StorePurchase => ({ platform: "ios", productId: "premium_monthly", proof, raw: { proof } });

describe("resumePendingPurchases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshClaims.mockResolvedValue(undefined);
    mockClient.finish.mockResolvedValue(undefined);
  });

  it("unfinished purchase is re-verified on start", async () => {
    mockClient.listUnfinished.mockResolvedValue([purchase("a"), purchase("b"), purchase("c")]);
    mockVerify.mockImplementation(async (p) =>
      p.proof === "b" ? { ok: false, reason: "NETWORK" } : { ok: true },
    );

    await resumePendingPurchases();

    expect(mockVerify.mock.calls.map(([p]) => p.proof)).toEqual(["a", "b", "c"]);
    expect(mockClient.finish.mock.calls.map(([p]) => p.proof)).toEqual(["a", "c"]);
    expect(mockRefreshClaims).toHaveBeenCalled();
  });

  it("목록 조회가 실패해도 던지지 않고 [iap] 경고만 남긴다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockClient.listUnfinished.mockRejectedValue(new Error("not connected"));

    await expect(resumePendingPurchases()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[iap]", expect.any(Error));
    warn.mockRestore();
  });

  it("한 건의 verify가 던져도 나머지는 계속 처리한다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockClient.listUnfinished.mockResolvedValue([purchase("a"), purchase("b")]);
    mockVerify.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true });

    await resumePendingPurchases();

    expect(mockClient.finish.mock.calls.map(([p]) => p.proof)).toEqual(["b"]);
    warn.mockRestore();
  });
});

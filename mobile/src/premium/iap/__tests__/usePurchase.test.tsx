import { renderHook, act, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { PurchaseClient, StorePurchase } from "../purchaseClient";
import type { VerifyResult } from "../verifyApi";

const listeners: { purchase: ((p: StorePurchase) => void) | null; error: ((e: unknown) => void) | null } = {
  purchase: null,
  error: null,
};
const mockUnsubscribe = jest.fn();
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

const callOrder: string[] = [];
const mockVerify = jest.fn<(p: StorePurchase) => Promise<VerifyResult>>();
const mockFetchAccountToken = jest.fn<() => Promise<string>>();
jest.mock("../verifyApi", () => ({
  verifyPurchase: (p: StorePurchase) => mockVerify(p),
  fetchAccountToken: () => mockFetchAccountToken(),
}));

const mockRefreshClaims = jest.fn<() => Promise<void>>();
jest.mock("../../useEntitlementSync", () => ({ refreshClaims: () => mockRefreshClaims() }));

import { usePurchase } from "../usePurchase";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const purchase = (proof: string): StorePurchase => ({ platform: "ios", productId: "premium_monthly", proof, raw: { proof } });

describe("usePurchase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;
    listeners.purchase = null;
    listeners.error = null;
    mockClient.onPurchase.mockImplementation((cb, onError) => {
      listeners.purchase = cb;
      listeners.error = onError;
      return mockUnsubscribe;
    });
    mockClient.buy.mockResolvedValue(undefined);
    mockClient.finish.mockImplementation(async () => {
      callOrder.push("finish");
    });
    mockFetchAccountToken.mockResolvedValue(TOKEN);
    mockVerify.mockImplementation(async () => {
      callOrder.push("verify");
      return { ok: true };
    });
    mockRefreshClaims.mockImplementation(async () => {
      callOrder.push("refreshClaims");
    });
  });

  it("buy: fetches account token then calls client.buy with it", async () => {
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.buy(true);
    });
    expect(mockFetchAccountToken).toHaveBeenCalledTimes(1);
    expect(mockClient.buy).toHaveBeenCalledWith({ withTrial: true, accountToken: TOKEN });
    expect(result.current.phase).toBe("buying");
  });

  it("purchase event → verify → refreshClaims → finish", async () => {
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.buy(false);
    });
    await act(async () => {
      listeners.purchase?.(purchase("jws-1"));
    });
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(callOrder).toEqual(["verify", "refreshClaims", "finish"]);
    expect(mockClient.finish).toHaveBeenCalledWith(purchase("jws-1"));
    expect(result.current.lastError).toBeNull();
  });

  it("verify NETWORK failure → not finished, lastError NETWORK", async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: "NETWORK" });
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      listeners.purchase?.(purchase("jws-1"));
    });
    await waitFor(() => expect(result.current.lastError).toBe("NETWORK"));
    expect(mockClient.finish).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  it("verify LINKED_TO_OTHER_ACCOUNT → not finished, lastError LINKED_TO_OTHER_ACCOUNT", async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: "LINKED_TO_OTHER_ACCOUNT" });
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      listeners.purchase?.(purchase("jws-1"));
    });
    await waitFor(() => expect(result.current.lastError).toBe("LINKED_TO_OTHER_ACCOUNT"));
    expect(mockClient.finish).not.toHaveBeenCalled();
    expect(mockRefreshClaims).not.toHaveBeenCalled();
  });

  it("PENDING → 끝내지 않는다(결제가 끝나면 스토어가 다시 보낸다)", async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: "PENDING" });
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      listeners.purchase?.(purchase("ptoken-1"));
    });
    await waitFor(() => expect(result.current.lastError).toBe("PENDING"));
    expect(mockClient.finish).not.toHaveBeenCalled();
  });

  it("account token 조회 실패 → 스토어를 열지 않고 lastError NETWORK", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockFetchAccountToken.mockRejectedValue(new Error("offline"));
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.buy(true);
    });
    expect(mockClient.buy).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe("NETWORK");
    expect(result.current.phase).toBe("idle");
    warn.mockRestore();
  });

  it("스토어 오류(취소 등) 이벤트 → idle로 돌아간다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.buy(true);
    });
    await act(async () => {
      listeners.error?.({ code: "user-cancelled" });
    });
    expect(result.current.phase).toBe("idle");
    warn.mockRestore();
  });

  it("restore = listUnfinished + available purchases re-verify", async () => {
    mockClient.listUnfinished.mockResolvedValue([purchase("a")]);
    // a는 양쪽에 다 나온다 — proof 기준으로 한 번만 검증한다.
    mockClient.listAvailable.mockResolvedValue([purchase("a"), purchase("b"), purchase("c")]);
    mockVerify.mockImplementation(async (p) => (p.proof === "c" ? { ok: false, reason: "INVALID" } : { ok: true }));

    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.restore();
    });

    expect(mockVerify.mock.calls.map(([p]) => p.proof).sort()).toEqual(["a", "b", "c"]);
    expect(mockClient.finish.mock.calls.map(([p]) => p.proof).sort()).toEqual(["a", "b"]);
    expect(result.current.phase).toBe("idle");
    expect(result.current.lastError).toBeNull();
  });

  it("restore에서 성공이 하나도 없으면 첫 실패 사유를 남긴다", async () => {
    mockClient.listUnfinished.mockResolvedValue([]);
    mockClient.listAvailable.mockResolvedValue([purchase("a")]);
    mockVerify.mockResolvedValue({ ok: false, reason: "LINKED_TO_OTHER_ACCOUNT" });

    const { result } = await renderHook(() => usePurchase());
    await act(async () => {
      await result.current.restore();
    });
    expect(mockClient.finish).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe("LINKED_TO_OTHER_ACCOUNT");
  });

  it("언마운트하면 리스너를 해제한다", async () => {
    const { unmount } = await renderHook(() => usePurchase());
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

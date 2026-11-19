import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { StorePurchase } from "../purchaseClient";

const mockGetIdToken = jest.fn<() => Promise<string>>();
jest.mock("../../../firebase", () => ({
  auth: { currentUser: { uid: "u1", getIdToken: () => mockGetIdToken() } },
  db: {},
}));

import { verifyPurchase, fetchAccountToken } from "../verifyApi";

const fetchMock = jest.fn<typeof fetch>();
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const iosPurchase: StorePurchase = { platform: "ios", productId: "premium_monthly", proof: "jws-1", raw: {} };
const androidPurchase: StorePurchase = { platform: "android", productId: "premium_monthly", proof: "ptoken-1", raw: {} };

describe("verifyApi", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_BILLING_PROXY_URL = "https://bill.example";
    mockGetIdToken.mockResolvedValue("id-token");
    fetchMock.mockReset();
    global.fetch = fetchMock;
    // 실패 경로는 [iap] 경고를 남긴다 — 테스트 출력에는 찍지 않는다.
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_BILLING_PROXY_URL;
    jest.restoreAllMocks();
  });

  it("verifyApi posts {jws} to /iap/apple/verify on ios and {purchaseToken, productId} to /iap/google/verify on android with Bearer token", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ premiumUntil: "2026-12-19T00:00:00.000Z" }));

    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: true });
    expect(await verifyPurchase(androidPurchase)).toEqual({ ok: true });

    const [[iosUrl, iosInit], [androidUrl, androidInit]] = fetchMock.mock.calls;
    expect(iosUrl).toBe("https://bill.example/iap/apple/verify");
    expect(iosInit?.method).toBe("POST");
    expect(JSON.parse(iosInit?.body as string)).toEqual({ jws: "jws-1" });
    expect(androidUrl).toBe("https://bill.example/iap/google/verify");
    expect(JSON.parse(androidInit?.body as string)).toEqual({ purchaseToken: "ptoken-1", productId: "premium_monthly" });
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    }
  });

  it("verifyApi maps 409 → LINKED_TO_OTHER_ACCOUNT, 400 → INVALID, fetch throw/5xx → NETWORK", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "LINKED_TO_OTHER_ACCOUNT" }, 409));
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "LINKED_TO_OTHER_ACCOUNT" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "INVALID_TRANSACTION" }, 400));
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "INVALID" });

    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "NETWORK" });

    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }));
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "NETWORK" });
  });

  it("409는 상태가 아니라 error 필드로 구분한다(ALREADY_SUBSCRIBED)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "ALREADY_SUBSCRIBED" }, 409));
    expect(await verifyPurchase(androidPurchase)).toEqual({ ok: false, reason: "ALREADY_SUBSCRIBED" });
  });

  it("403 → INVALID, pending: true → PENDING", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "NOT_ALLOWED" }, 403));
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "INVALID" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ premiumUntil: null, pending: true }));
    expect(await verifyPurchase(androidPurchase)).toEqual({ ok: false, reason: "PENDING" });
  });

  it("서버 주소가 없으면 요청 없이 NETWORK", async () => {
    delete process.env.EXPO_PUBLIC_BILLING_PROXY_URL;
    expect(await verifyPurchase(iosPurchase)).toEqual({ ok: false, reason: "NETWORK" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchAccountToken은 /iap/account-token에 Bearer로 POST하고 appAccountToken을 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ appAccountToken: "11111111-2222-4333-8444-555555555555" }));
    await expect(fetchAccountToken()).resolves.toBe("11111111-2222-4333-8444-555555555555");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://bill.example/iap/account-token");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
  });

  it("fetchAccountToken 실패는 던진다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(fetchAccountToken()).rejects.toThrow();
  });
});

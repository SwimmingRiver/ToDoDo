import { describe, expect, it, vi } from "vitest";
import { signServiceAccountJwt, GOOGLE_SCOPES } from "../googleAuth";
import { PlayApi } from "../google/playApi";

const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const PKG = "com.swimmingriver.tododo";
const BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

const b64urlToJson = (s: string) => JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));

const makePem = async (): Promise<string> => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
};

describe("signServiceAccountJwt scope", () => {
  it("service account JWT carries given scope (androidpublisher)", async () => {
    const sa = { client_email: "sa@x.iam", private_key: await makePem() };
    const jwt = await signServiceAccountJwt(sa, 1000, PLAY_SCOPE);
    expect(b64urlToJson(jwt.split(".")[1]).scope).toBe(PLAY_SCOPE);
  });

  it("기본 scope는 기존 cloud-platform 그대로", async () => {
    const sa = { client_email: "sa@x.iam", private_key: await makePem() };
    const jwt = await signServiceAccountJwt(sa, 1000);
    expect(b64urlToJson(jwt.split(".")[1]).scope).toBe(GOOGLE_SCOPES);
  });
});

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const fullResponse = {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: "2026-11-01T00:00:00Z",
  linkedPurchaseToken: "old",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  testPurchase: {},
  externalAccountIdentifiers: { obfuscatedExternalAccountId: "uid-hash" },
  lineItems: [
    {
      productId: "premium_monthly",
      expiryTime: "2026-12-01T00:00:00Z",
      autoRenewingPlan: { autoRenewEnabled: true },
      offerDetails: { basePlanId: "monthly", offerId: "free-trial-7d" },
      offerPhase: { freeTrial: {} },
    },
  ],
};

describe("PlayApi", () => {
  it("getSubscription maps subscriptionsv2 response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes(fullResponse));
    const api = new PlayApi(PKG, async () => "tok", fetchFn as unknown as typeof fetch);
    const sub = await api.getSubscription("a/b");
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/${PKG}/purchases/subscriptionsv2/tokens/a%2Fb`);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    expect(sub).toEqual({
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      startTime: "2026-11-01T00:00:00Z",
      linkedPurchaseToken: "old",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
      testPurchase: true,
      obfuscatedAccountId: "uid-hash",
      lineItems: [
        { productId: "premium_monthly", expiryTime: "2026-12-01T00:00:00Z", autoRenewEnabled: true, basePlanId: "monthly", offerId: "free-trial-7d", inFreeTrial: true },
      ],
    });
  });

  it("선택 필드가 없으면 null/false로 채운다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        lineItems: [{ productId: "premium_monthly", expiryTime: "2026-12-01T00:00:00Z" }],
      }),
    );
    const sub = await new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t");
    expect(sub).toMatchObject({ startTime: null, linkedPurchaseToken: null, testPurchase: false, obfuscatedAccountId: null });
    expect(sub!.lineItems[0]).toMatchObject({ autoRenewEnabled: false, basePlanId: null, offerId: null, inFreeTrial: false });
  });

  it.each([404, 410])("getSubscription returns null on %i", async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status }));
    expect(await new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t")).toBeNull();
  });

  it("getSubscription throws on 5xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t")).rejects.toThrow();
  });

  it("pending subscription without expiryTime parses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        subscriptionState: "SUBSCRIPTION_STATE_PENDING",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        lineItems: [{ productId: "premium_monthly" }],
      }),
    );
    const sub = await new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t");
    expect(sub!.lineItems).toEqual([
      { productId: "premium_monthly", expiryTime: null, autoRenewEnabled: false, basePlanId: null, offerId: null, inFreeTrial: false },
    ]);
  });

  it("pending purchase canceled with empty lineItems parses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({ subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }),
    );
    const sub = await new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t");
    expect(sub!.lineItems).toEqual([]);
  });

  it.each([
    ["subscriptionState", { acknowledgementState: "A", lineItems: [] }],
    ["acknowledgementState", { subscriptionState: "S", lineItems: [] }],
    ["productId", { subscriptionState: "S", acknowledgementState: "A", lineItems: [{ expiryTime: "2026-12-01T00:00:00Z" }] }],
  ])("필수 필드(%s)가 없으면 명확한 에러", async (_name, body) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes(body));
    await expect(new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).getSubscription("t")).rejects.toThrow(/Play/);
  });

  it("acknowledge POSTs v3 purchases/subscriptions/{productId}/tokens/{token}:acknowledge", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    await new PlayApi(PKG, async () => "tok", fetchFn as unknown as typeof fetch).acknowledge("premium_monthly", "a/b");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/${PKG}/purchases/subscriptions/premium_monthly/tokens/a%2Fb:acknowledge`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("acknowledge는 실패 응답이면 throw", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 400 }));
    await expect(new PlayApi(PKG, async () => "t", fetchFn as unknown as typeof fetch).acknowledge("p", "t")).rejects.toThrow();
  });

  describe("cancelSubscription", () => {
    const api = (fetchFn: ReturnType<typeof vi.fn>) => new PlayApi(PKG, async () => "tok", fetchFn as unknown as typeof fetch);
    const errRes = (status: number) => jsonRes({ error: { code: status, message: "x", status: "FAILED_PRECONDITION" } }, status);
    const canceledState = {
      ...fullResponse,
      subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
      lineItems: [{ ...fullResponse.lineItems[0], autoRenewingPlan: { autoRenewEnabled: false } }],
    };

    it("cancelSubscription POSTs v3 applications/{pkg}/purchases/subscriptionsv2/tokens/{token}:cancel with developer cancellation type", async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      await expect(api(fetchFn).cancelSubscription("a/b")).resolves.toBe("canceled");
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/${PKG}/purchases/subscriptionsv2/tokens/a%2Fb:cancel`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer tok");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({ cancellationContext: { cancellationType: "DEVELOPER_REQUESTED_STOP_PAYMENTS" } });
    });

    it("cancelSubscription returns already_inactive for already-canceled/expired response", async () => {
      // 거절된 뒤 다시 조회해 더 이상 갱신되지 않으면 이미 해지된 것으로 본다.
      const canceled = vi.fn().mockResolvedValueOnce(errRes(400)).mockResolvedValueOnce(jsonRes(canceledState));
      await expect(api(canceled).cancelSubscription("t")).resolves.toBe("already_inactive");
      expect(canceled.mock.calls[1][0]).toBe(`${BASE}/${PKG}/purchases/subscriptionsv2/tokens/t`);

      const expired = vi.fn().mockResolvedValueOnce(errRes(400)).mockResolvedValueOnce(jsonRes({ ...canceledState, subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }));
      await expect(api(expired).cancelSubscription("t")).resolves.toBe("already_inactive");

      const gone = vi.fn().mockResolvedValueOnce(errRes(410)).mockResolvedValueOnce(errRes(410));
      await expect(api(gone).cancelSubscription("t")).resolves.toBe("already_inactive");
    });

    it("거절됐는데 다시 조회해도 여전히 자동 갱신 중이면 throw", async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(errRes(400)).mockResolvedValueOnce(jsonRes(fullResponse));
      await expect(api(fetchFn).cancelSubscription("t")).rejects.toThrow(/Play 구독 해지 실패: 400/);
    });

    it.each([500, 503, 429, 401, 403])("cancelSubscription throws on %i (다시 조회하지 않는다)", async (status) => {
      const fetchFn = vi.fn().mockResolvedValue(errRes(status));
      await expect(api(fetchFn).cancelSubscription("t")).rejects.toThrow(`Play 구독 해지 실패: ${status}`);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });
});

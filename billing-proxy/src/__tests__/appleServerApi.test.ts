import { describe, it, expect, vi } from "vitest";
import { AppleServerApi } from "../apple/serverApi";

const NOW = new Date("2026-06-01T00:00:00Z");
const PROD = "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/";
const SANDBOX = "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/";

const b64u = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

const makeKey = async () => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = Buffer.from((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
};

const tx = (over: Record<string, unknown> = {}) => ({
  originalTransactionId: "100",
  transactionId: "101",
  bundleId: "com.swimmingriver.tododo",
  productId: "premium_monthly",
  purchaseDate: 1,
  originalPurchaseDate: 1,
  expiresDate: 2,
  environment: "Production",
  ...over,
});

// 가짜 검증기: "tx:<json>" 형태 문자열을 그대로 디코드한다(서명 검증은 jws.test가 담당).
const fakeVerify = async (jws: string) => JSON.parse(jws.replace(/^j:/, ""));
const sign = (obj: unknown) => `j:${JSON.stringify(obj)}`;

const body = (entries: unknown[]) => ({ data: [{ subscriptionGroupIdentifier: "g", lastTransactions: entries }] });
const entry = (t: Record<string, unknown>, status = 1) => ({
  originalTransactionId: t.originalTransactionId,
  status,
  signedTransactionInfo: sign(t),
  signedRenewalInfo: sign({ autoRenewStatus: 1 }),
});
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

const setup = async (responses: Response[]) => {
  const key = await makeKey();
  const fetchFn = vi.fn(async () => responses.shift()!);
  const api = new AppleServerApi(
    { bundleId: "com.swimmingriver.tododo", issuerId: "issuer-1", keyId: "KEY123", privateKeyPem: key.pem },
    fakeVerify,
    fetchFn as unknown as typeof fetch,
    () => NOW,
  );
  return { api, fetchFn, key };
};

describe("AppleServerApi", () => {
  it("signs ES256 JWT with kid, iss, aud appstoreconnect-v1, bid, exp ≤ iat+3600", async () => {
    const { api, fetchFn, key } = await setup([ok(body([entry(tx())]))]);
    await api.getSubscriptionSnapshot("101");
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    const token = (init.headers as Record<string, string>).Authorization.replace("Bearer ", "");
    const [h, p, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const iat = Math.floor(NOW.getTime() / 1000);
    expect(payload).toMatchObject({ iss: "issuer-1", aud: "appstoreconnect-v1", bid: "com.swimmingriver.tododo", iat });
    expect(payload.exp).toBeLessThanOrEqual(iat + 3600);
    expect(payload.exp).toBeGreaterThan(iat);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key.publicKey,
      Buffer.from(s, "base64url"),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });

  it("calls GET https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{id}", async () => {
    const { api, fetchFn } = await setup([ok(body([entry(tx())]))]);
    await api.getSubscriptionSnapshot("101");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PROD}101`);
    expect(init.method).toBe("GET");
  });

  it("caches the token between calls", async () => {
    const { api, fetchFn } = await setup([ok(body([entry(tx())])), ok(body([entry(tx())]))]);
    await api.getSubscriptionSnapshot("101");
    await api.getSubscriptionSnapshot("101");
    const auth = (i: number) => ((fetchFn.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization;
    expect(auth(0)).toBe(auth(1));
  });

  it("falls back to sandbox on 404", async () => {
    const { api, fetchFn } = await setup([
      new Response("{}", { status: 404 }),
      ok(body([entry(tx({ environment: "Sandbox" }))])),
    ]);
    const snap = await api.getSubscriptionSnapshot("101");
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).toBe(`${SANDBOX}101`);
    expect(snap?.transaction.environment).toBe("Sandbox");
  });

  it("returns null when both 404", async () => {
    const { api } = await setup([new Response("{}", { status: 404 }), new Response("{}", { status: 404 })]);
    expect(await api.getSubscriptionSnapshot("101")).toBeNull();
  });

  it("picks lastTransactions entry matching originalTransactionId, verifies both signed fields", async () => {
    const other = tx({ originalTransactionId: "999", transactionId: "998" });
    const mine = tx({ originalTransactionId: "100", transactionId: "105" });
    const { api } = await setup([ok(body([entry(other, 2), entry(mine, 4)]))]);
    const verify = vi.fn(fakeVerify);
    (api as unknown as { verify: typeof verify }).verify = verify;
    const snap = await api.getSubscriptionSnapshot("105");
    expect(snap).toEqual({
      status: 4,
      transaction: mine,
      renewal: { autoRenewStatus: 1 },
      notificationUUID: null,
      signedDate: null,
    });
    // 두 서명 필드 모두 검증기를 거쳐야 한다.
    expect(verify).toHaveBeenCalledWith(sign(mine));
    expect(verify).toHaveBeenCalledWith(sign({ autoRenewStatus: 1 }));
  });

  it("throws on 5xx, 429 and 401", async () => {
    for (const status of [500, 429, 401]) {
      const { api } = await setup([new Response("x", { status })]);
      await expect(api.getSubscriptionSnapshot("101")).rejects.toThrow();
    }
  });

  it("throws on malformed transaction payload or bad status", async () => {
    const bad = { ...tx(), expiresDate: "soon" };
    const { api } = await setup([ok(body([entry(bad)]))]);
    await expect(api.getSubscriptionSnapshot("101")).rejects.toThrow(/expiresDate/);
    const { api: api2 } = await setup([ok(body([entry(tx(), 9)]))]);
    await expect(api2.getSubscriptionSnapshot("101")).rejects.toThrow(/status/);
  });

  it("returns renewal null when signedRenewalInfo is absent", async () => {
    const e = { ...entry(tx()), signedRenewalInfo: undefined };
    const { api } = await setup([ok(body([e]))]);
    expect((await api.getSubscriptionSnapshot("101"))?.renewal).toBeNull();
  });
});
